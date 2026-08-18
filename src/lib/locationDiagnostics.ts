/**
 * Per-user location diagnostics.
 *
 * `@/lib/geoDiagnostics` keeps a rich, device-local ring buffer. That is great
 * for debugging one device but invisible to us. This module mirrors the few
 * facts we need to answer "why is this account producing (no) rows?" into
 * `public.location_tracking_diagnostics` — one snapshot row per user, RLS
 * scoped to the owner (admins can read all):
 *
 * - permission_state    : browser/OS geolocation permission at tracker start
 * - prompt_outcome      : what happened the last time we asked
 * - tracking/background : the user's own preference toggles
 * - last_write_at       : when a `user_locations` row last landed (+ counter)
 * - last_error/skip     : why the most recent attempt produced nothing
 *
 * No coordinates are ever stored here.
 */

import { supabase } from "@/integrations/supabase/client";
import { isNativeApp } from "@/lib/platform";

export type PermissionState =
  | "granted"
  | "denied"
  | "prompt"
  | "unsupported"
  | "unknown";

export type PromptOutcome =
  | "shown"
  | "granted"
  | "denied"
  | "dismissed"
  | "suppressed";

type Snapshot = {
  platform: string;
  permission_state: string;
  permission_checked_at: string;
  prompt_outcome: string;
  prompt_outcome_at: string;
  tracking_enabled: boolean;
  background_enabled: boolean;
  tracker_started_at: string;
  last_write_at: string;
  last_write_source: string;
  write_count: number;
  last_skip_reason: string;
  last_skip_at: string;
  last_error: string;
  last_error_at: string;
};

/** Coalesce bursts of updates into one round-trip. */
const FLUSH_DELAY_MS = 4_000;

let pending: Partial<Snapshot> = {};
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let writeCount = 0;
let flushing = false;

export const platformTag = () => (isNativeApp() ? "native" : "web");

/** Read the current browser geolocation permission without prompting. */
export const readPermissionState = async (): Promise<PermissionState> => {
  if (typeof navigator === "undefined" || !("geolocation" in navigator))
    return "unsupported";
  try {
    const status = await navigator.permissions?.query?.({
      name: "geolocation" as PermissionName,
    });
    if (!status) return "unknown";
    return status.state as PermissionState;
  } catch {
    return "unknown";
  }
};

const flush = async () => {
  if (flushing) return;
  const patch = pending;
  pending = {};
  if (!Object.keys(patch).length) return;

  flushing = true;
  try {
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user?.id;
    if (!userId) return;
    await supabase
      .from("location_tracking_diagnostics")
      .upsert({ user_id: userId, ...patch }, { onConflict: "user_id" });
  } catch (e) {
    if (import.meta.env.DEV)
      console.warn("[location-diagnostics] flush failed", e);
  } finally {
    flushing = false;
  }
};

const queue = (patch: Partial<Snapshot>) => {
  if (typeof window === "undefined") return;
  pending = { ...pending, ...patch };
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush();
  }, FLUSH_DELAY_MS);
};

/** Tracker start: records permission + preference state for this session. */
export const recordTrackerStart = async (opts: {
  trackingEnabled: boolean;
  backgroundEnabled: boolean;
  permissionState?: PermissionState;
}) => {
  const state = opts.permissionState ?? (await readPermissionState());
  const now = new Date().toISOString();
  queue({
    platform: platformTag(),
    permission_state: state,
    permission_checked_at: now,
    tracking_enabled: opts.trackingEnabled,
    background_enabled: opts.backgroundEnabled,
    tracker_started_at: now,
  });
  return state;
};

/** A permission change observed while the app is open. */
export const recordPermissionState = (state: PermissionState) =>
  queue({
    platform: platformTag(),
    permission_state: state,
    permission_checked_at: new Date().toISOString(),
  });

/** What the user did with the location prompt. */
export const recordPromptOutcome = (outcome: PromptOutcome) =>
  queue({
    platform: platformTag(),
    prompt_outcome: outcome,
    prompt_outcome_at: new Date().toISOString(),
  });

/** A `user_locations` row actually landed. */
export const recordLocationWrite = (source: "gps" | "network") => {
  writeCount += 1;
  queue({
    last_write_at: new Date().toISOString(),
    last_write_source: source,
    write_count: writeCount,
  });
};

/** The insert failed (RLS, network, offline). */
export const recordLocationWriteError = (message: string) =>
  queue({
    last_error: message.slice(0, 300),
    last_error_at: new Date().toISOString(),
  });

/** A fix arrived but the throttles/smoother chose not to write it. */
export const recordLocationSkip = (reason: string) =>
  queue({
    last_skip_reason: reason.slice(0, 200),
    last_skip_at: new Date().toISOString(),
  });

/** Push anything buffered right away (e.g. before the tab closes). */
export const flushLocationDiagnostics = () => flush();

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => void flush());
}
