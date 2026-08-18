/**
 * Durable retry queue for "mark alert as read" writes.
 *
 * The UI updates optimistically the moment a user taps an alert, so the write
 * itself must survive a flaky connection, an offline tap, or a reload. Pending
 * writes are persisted and replayed on reconnect, on tab focus, and on a slow
 * background timer with exponential backoff.
 */
import { supabase } from "@/integrations/supabase/client";

export type ReadSource = "log" | "delivery";

export interface PendingRead {
  id: string;
  source?: ReadSource;
  attempts: number;
  /** epoch ms — earliest time this item may be retried */
  nextAt: number;
}

const KEY = "jet:pending-alert-reads";
const LIMIT = 100;
const BACKOFF_MS = [2_000, 5_000, 15_000, 60_000, 300_000];

let memory: PendingRead[] | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;
let wired = false;

function store(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function load(): PendingRead[] {
  if (memory) return memory;
  try {
    const raw = store()?.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    memory = Array.isArray(parsed)
      ? parsed.filter((v) => v && typeof v.id === "string")
      : [];
  } catch {
    memory = [];
  }
  return memory!;
}

function persist(list: PendingRead[]) {
  memory = list.slice(-LIMIT);
  try {
    store()?.setItem(KEY, JSON.stringify(memory));
  } catch {
    /* private mode — the in-memory copy still retries this session */
  }
}

export function pendingReadCount() {
  return load().length;
}

/** True when this alert has an unsynced read write waiting. */
export function isReadPending(id: string) {
  return load().some((item) => item.id === id);
}

export function enqueueRead(id: string, source?: ReadSource) {
  if (!id) return;
  const list = load();
  if (list.some((item) => item.id === id && item.source === source)) return;
  persist([...list, { id, source, attempts: 0, nextAt: Date.now() }]);
  scheduleFlush(0);
}

function dequeue(id: string, source?: ReadSource) {
  persist(load().filter((item) => !(item.id === id && item.source === source)));
}

function backoffFor(attempts: number) {
  return BACKOFF_MS[Math.min(attempts, BACKOFF_MS.length - 1)];
}

/** Performs the actual Supabase writes. Returns true when at least one landed. */
export async function writeRead(id: string, source?: ReadSource) {
  const writes: PromiseLike<{ error: unknown }>[] = [];
  if (source !== "delivery") {
    writes.push(
      supabase.from("notification_logs").update({ read: true }).eq("id", id),
    );
  }
  if (source !== "log") {
    writes.push(
      supabase
        .from("notification_deliveries")
        .update({ status: "opened", opened_at: new Date().toISOString() })
        .eq("id", id),
    );
  }
  const results = await Promise.allSettled(writes);
  return results.some(
    (r) => r.status === "fulfilled" && !(r.value as { error?: unknown })?.error,
  );
}

function scheduleFlush(delay: number) {
  if (typeof window === "undefined") return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void flushPendingReads();
  }, Math.max(0, delay));
}

export async function flushPendingReads() {
  if (typeof window === "undefined") return;
  if (flushing) return;
  const list = load();
  if (list.length === 0) return;
  if (navigator.onLine === false) return; // wait for the `online` event

  flushing = true;
  let changed = false;
  try {
    const now = Date.now();
    for (const item of [...list]) {
      if (item.nextAt > now) continue;
      let ok = false;
      try {
        ok = await writeRead(item.id, item.source);
      } catch {
        ok = false;
      }
      if (ok) {
        dequeue(item.id, item.source);
        changed = true;
      } else {
        const attempts = item.attempts + 1;
        persist(
          load().map((entry) =>
            entry.id === item.id && entry.source === item.source
              ? { ...entry, attempts, nextAt: Date.now() + backoffFor(attempts) }
              : entry,
          ),
        );
      }
    }
  } finally {
    flushing = false;
  }

  if (changed) {
    try {
      window.dispatchEvent(new CustomEvent("jet:notifications-refresh"));
    } catch {
      /* non-browser context */
    }
  }

  const remaining = load();
  if (remaining.length) {
    const soonest = Math.min(...remaining.map((item) => item.nextAt));
    scheduleFlush(Math.max(1_000, soonest - Date.now()));
  }
}

/** Wires reconnect/focus retries once per session. */
export function initNotificationReadQueue() {
  if (wired || typeof window === "undefined") return;
  wired = true;
  const retry = () => void flushPendingReads();
  window.addEventListener("online", retry);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") retry();
  });
  retry();
}
