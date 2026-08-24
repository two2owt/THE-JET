/**
 * Local "already read" ledger for alerts.
 *
 * The durable write queue (`notificationReadQueue`) guarantees the server
 * eventually learns an alert was read. This ledger covers the gap in between:
 * a reload that happens while a read write is still in flight, a delivery row
 * whose `status` update was dropped by RLS, or a legacy log row the user
 * cleared on another surface. Without it, alerts the user already dismissed
 * pop back up as new on the next load.
 *
 * Entries are pruned after 60 days so the ledger can't grow without bound.
 */

const KEY = "jet:read-alerts";
const MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000;
const LIMIT = 500;

type Ledger = Record<string, number>;

let memory: Ledger | null = null;

function store(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function load(): Ledger {
  if (memory) return memory;
  let parsed: unknown = null;
  try {
    const raw = store()?.getItem(KEY);
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }
  const now = Date.now();
  const next: Ledger = {};
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    for (const [id, at] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof at === "number" && now - at < MAX_AGE_MS) next[id] = at;
    }
  }
  memory = next;
  return memory;
}

function persist(ledger: Ledger) {
  const entries = Object.entries(ledger)
    .sort((a, b) => b[1] - a[1])
    .slice(0, LIMIT);
  memory = Object.fromEntries(entries);
  try {
    store()?.setItem(KEY, JSON.stringify(memory));
  } catch {
    /* private mode — the in-memory copy still holds for this session */
  }
}

/** Records that this alert has been read on this device. */
export function markReadLocally(id: string | null | undefined) {
  if (!id) return;
  const ledger = load();
  if (ledger[id]) return;
  persist({ ...ledger, [id]: Date.now() });
}

export function markManyReadLocally(ids: Array<string | null | undefined>) {
  const ledger = { ...load() };
  const now = Date.now();
  let changed = false;
  for (const id of ids) {
    if (!id || ledger[id]) continue;
    ledger[id] = now;
    changed = true;
  }
  if (changed) persist(ledger);
}

/** True when this alert was marked read on this device. */
export function isReadLocally(id: string | null | undefined): boolean {
  if (!id) return false;
  return Boolean(load()[id]);
}

/** Test helper — drops the cached ledger. */
export function resetReadLedger() {
  memory = null;
  try {
    store()?.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
