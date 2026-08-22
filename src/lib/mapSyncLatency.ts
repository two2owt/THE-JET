import { supabase } from "@/integrations/supabase/client";

/**
 * End-to-end map sync telemetry.
 *
 * Four stages are timed on the client and batched into
 * `public.map_sync_latency_samples`:
 *
 * - `write`      — location insert round trip (client -> Cloud ack)
 * - `fetch`      — density/paths endpoint round trip
 * - `render`     — data arrival -> Mapbox layer painted
 * - `end_to_end` — freshest DB row `created_at` -> heatmap painted
 *
 * A cron job (`check_map_sync_latency`) rolls p95 per stage every 10 minutes,
 * opens/resolves alerts against configurable thresholds and emails admins the
 * first time a stage degrades.
 */

export type MapSyncStage = "write" | "fetch" | "render" | "end_to_end";

interface Sample {
  stage: MapSyncStage;
  layer: string;
  latency_ms: number;
  detail: Record<string, unknown>;
}

/** Fraction of eligible samples actually persisted (keeps the table lean). */
const SAMPLE_RATE = 0.25;
/** Flush cadence and buffer ceiling. */
const FLUSH_INTERVAL_MS = 30_000;
const MAX_BUFFER = 20;
/** Server CHECK constraint upper bound. */
const MAX_LATENCY_MS = 3_600_000;

const buffer: Sample[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let listenersBound = false;

const flush = async () => {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (buffer.length === 0) return;
  const batch = buffer.splice(0, buffer.length);
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) return; // RLS requires an owner; drop anonymous samples.
    await supabase
      .from("map_sync_latency_samples")
      .insert(
        batch.map((s) => ({
          ...s,
          detail: s.detail as never,
          user_id: userId,
        })),
      );

  } catch {
    // Telemetry must never break the map.
  }
};

const scheduleFlush = () => {
  if (flushTimer) return;
  flushTimer = setTimeout(() => void flush(), FLUSH_INTERVAL_MS);
};

const bindListeners = () => {
  if (listenersBound || typeof document === "undefined") return;
  listenersBound = true;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) void flush();
  });
  window.addEventListener("pagehide", () => void flush());
};

/** Record one latency sample. Sampled, buffered, and fully fire-and-forget. */
export const recordMapSyncLatency = (
  stage: MapSyncStage,
  latencyMs: number,
  options: { layer?: string; detail?: Record<string, unknown>; force?: boolean } = {},
) => {
  if (typeof window === "undefined") return;
  if (!Number.isFinite(latencyMs) || latencyMs < 0) return;
  if (!options.force && Math.random() > SAMPLE_RATE) return;

  bindListeners();
  buffer.push({
    stage,
    layer: options.layer ?? "heatmap",
    latency_ms: Math.min(Math.round(latencyMs), MAX_LATENCY_MS),
    detail: options.detail ?? {},
  });

  if (buffer.length >= MAX_BUFFER) void flush();
  else scheduleFlush();
};

/** Times an async op and records it under `stage`. Errors are re-thrown. */
export const measureMapSync = async <T>(
  stage: MapSyncStage,
  fn: () => Promise<T>,
  options: { layer?: string; detail?: Record<string, unknown> } = {},
): Promise<T> => {
  const start =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  try {
    return await fn();
  } finally {
    const end =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    recordMapSyncLatency(stage, end - start, options);
  }
};

/**
 * How long a pending local write stays eligible for a freshness sample. If the
 * point we just wrote hasn't surfaced in a payload within this window the run
 * is discarded rather than reported as a multi-minute latency.
 */
const PENDING_WRITE_TTL_MS = 90_000;

/** The last location this client wrote, awaiting its first appearance. */
let pendingWrite: { pointAt: number; ackedAt: number } | null = null;
/** Newest server point already measured, so idle refetches aren't re-sampled. */
let lastMeasuredPointAt: number | null = null;

/**
 * Marks a location row this client just wrote as pending. Freshness is only
 * sampled once that point (or a newer one) shows up in a density payload, so
 * the metric measures pipeline lag rather than how long the user stood still.
 */
export const markLocationWrite = (pointAt: number = Date.now()) => {
  pendingWrite = { pointAt, ackedAt: Date.now() };
};

/**
 * Latency from a location write being acknowledged to that data being painted.
 *
 * A sample is skipped when:
 * - the payload came from a widened fallback window (data sparsity), or
 * - this client has no pending write (nothing new to observe — an idle user
 *   polling stale data is not sync lag), or
 * - the payload's newest point predates the pending write (not visible yet), or
 * - the pending write is older than {@link PENDING_WRITE_TTL_MS}, or
 * - the newest point is unchanged since the previous paint (idle refetch).
 */
export const recordEndToEndFreshness = (
  newestPointAt: string | null | undefined,
  options: {
    layer?: string;
    detail?: Record<string, unknown>;
    isFallback?: boolean | null;
  } = {},
) => {
  if (options.isFallback) return;
  if (!newestPointAt) return;
  const written = Date.parse(newestPointAt);
  if (!Number.isFinite(written)) return;
  if (lastMeasuredPointAt !== null && written <= lastMeasuredPointAt) return;

  const pending = pendingWrite;
  if (!pending) return;
  const now = Date.now();
  if (now - pending.ackedAt > PENDING_WRITE_TTL_MS) {
    pendingWrite = null;
    return;
  }
  // Allow a small clock skew between client and server timestamps.
  if (written < pending.pointAt - 5_000) return;

  lastMeasuredPointAt = written;
  pendingWrite = null;
  const delta = now - pending.ackedAt;
  if (delta < 0) return;
  recordMapSyncLatency("end_to_end", delta, options);
};

/** Exposed for tests. */
export const __resetEndToEndFreshness = () => {
  lastMeasuredPointAt = null;
  pendingWrite = null;
};


/** Exposed for tests. */
export const __flushMapSyncLatency = flush;
