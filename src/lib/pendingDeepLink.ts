/**
 * Cold-start deep-link buffer (FIFO).
 *
 * When push notifications are tapped while the app is closed, the OS launches
 * the shell and fires `pushNotificationActionPerformed` (native) or opens a
 * new window (web) BEFORE React/the router has mounted. Navigating at that
 * moment is a no-op, so taps silently land on the map instead of the JetCard.
 *
 * Several alerts can be tapped/queued before the router is ready (notification
 * groups, rapid taps, an OS replay on resume), so entries are kept in a queue
 * ordered by arrival and flushed one at a time. sessionStorage keeps the queue
 * alive across the launch reload.
 */
import { hasProcessedAlert } from "@/lib/notificationIdempotency";

const KEY = "jet:pending-deep-link";
/** Guard against unbounded growth from a notification storm. */
const LIMIT = 20;
/** Taps older than this are stale — the user has moved on. */
const MAX_AGE_MS = 60 * 60 * 1000;

export type PendingDeepLink = {
  target: string;
  /** Inbox row id from the push payload, so we can mark it read on open. */
  notificationId?: string | null;
  /** Arrival time (epoch ms) — preserves tap order across a relaunch. */
  queuedAt: number;
};

let memory: PendingDeepLink[] | null = null;

function normalize(value: unknown): PendingDeepLink | null {
  if (typeof value === "string") {
    return value ? { target: value, notificationId: null, queuedAt: 0 } : null;
  }
  if (value && typeof value === "object") {
    const entry = value as Partial<PendingDeepLink>;
    if (!entry.target) return null;
    return {
      target: entry.target,
      notificationId: entry.notificationId ?? null,
      queuedAt: typeof entry.queuedAt === "number" ? entry.queuedAt : 0,
    };
  }
  return null;
}

function parse(raw: string | null): PendingDeepLink[] {
  if (!raw) return [];
  // Legacy single-slot values: a bare path or one JSON object.
  if (!raw.startsWith("[")) {
    if (!raw.startsWith("{")) {
      const single = normalize(raw);
      return single ? [single] : [];
    }
    try {
      const single = normalize(JSON.parse(raw));
      return single ? [single] : [];
    } catch {
      return [];
    }
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalize)
      .filter((entry): entry is PendingDeepLink => !!entry);
  } catch {
    return [];
  }
}

function fresh(list: PendingDeepLink[]) {
  const now = Date.now();
  return list.filter((entry) => !entry.queuedAt || now - entry.queuedAt < MAX_AGE_MS);
}

function load(): PendingDeepLink[] {
  if (memory) return memory;
  let stored: PendingDeepLink[] = [];
  try {
    stored = parse(sessionStorage.getItem(KEY));
  } catch {
    stored = [];
  }
  memory = fresh(stored).sort((a, b) => a.queuedAt - b.queuedAt);
  return memory;
}

function persist(list: PendingDeepLink[]) {
  memory = list.slice(-LIMIT);
  try {
    if (memory.length === 0) sessionStorage.removeItem(KEY);
    else sessionStorage.setItem(KEY, JSON.stringify(memory));
  } catch {
    /* private mode — memory copy is enough */
  }
}

export function queueDeepLink(
  target: string | null | undefined,
  notificationId?: string | null,
) {
  if (!target) return;
  // The OS can replay the same tap (relaunch + resume). Once an alert has been
  // navigated for, never re-queue it.
  if (hasProcessedAlert("nav", notificationId)) return;

  const list = load();
  // De-dupe within the queue: same alert id, or same target when there is no id.
  const duplicate = list.some((entry) =>
    notificationId
      ? entry.notificationId === notificationId
      : !entry.notificationId && entry.target === target,
  );
  if (duplicate) return;

  persist([
    ...list,
    { target, notificationId: notificationId ?? null, queuedAt: Date.now() },
  ]);
  try {
    window.dispatchEvent(new CustomEvent("jet:deep-link-queued"));
  } catch {
    /* non-browser context */
  }
}

/** Removes and returns the oldest queued tap. */
export function consumeDeepLink(): PendingDeepLink | null {
  const list = load();
  if (list.length === 0) return null;
  const [next, ...rest] = list;
  persist(rest);
  return next ?? null;
}

/** Everything still queued, oldest first (does not consume). */
export function peekDeepLinks(): PendingDeepLink[] {
  return [...load()];
}

export function pendingDeepLinkCount(): number {
  return load().length;
}

export function peekDeepLink(): string | null {
  return load()[0]?.target ?? null;
}

export function clearDeepLinks() {
  persist([]);
}
