/**
 * Durable idempotency ledger for push alert ids.
 *
 * The same alert can arrive twice: the service worker appends `?nid=` to the
 * opened URL *and* the native/web deep-link queue carries the same id, and a
 * cold start can replay both after a reload. Without a persisted ledger the
 * in-memory guard resets on every launch, so we keep a small capped ring in
 * localStorage (sessionStorage fallback) that survives reloads.
 */
const KEY = "jet:processed-alerts";
const LIMIT = 200;

let memory: string[] | null = null;

function store(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    try {
      return window.sessionStorage;
    } catch {
      return null;
    }
  }
}

function load(): string[] {
  if (memory) return memory;
  try {
    const raw = store()?.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    memory = Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    memory = [];
  }
  return memory;
}

function persist(list: string[]) {
  memory = list;
  try {
    store()?.setItem(KEY, JSON.stringify(list));
  } catch {
    /* private mode — memory copy is enough */
  }
}

/** Namespaced key so "mark read" and "navigate" are tracked independently. */
export function alertKey(scope: string, notificationId: string) {
  return `${scope}:${notificationId}`;
}

export function hasProcessedAlert(scope: string, notificationId?: string | null) {
  if (!notificationId) return false;
  return load().includes(alertKey(scope, notificationId));
}

/**
 * Atomically claims an alert id for a scope.
 * Returns false when it was already processed (caller should no-op).
 */
export function claimAlert(scope: string, notificationId?: string | null) {
  if (!notificationId) return true; // nothing to dedupe on
  const key = alertKey(scope, notificationId);
  const list = load();
  if (list.includes(key)) return false;
  const next = [...list, key];
  persist(next.length > LIMIT ? next.slice(next.length - LIMIT) : next);
  return true;
}

/** Releases a claim so a failed attempt can be retried. */
export function releaseAlert(scope: string, notificationId?: string | null) {
  if (!notificationId) return;
  const key = alertKey(scope, notificationId);
  persist(load().filter((v) => v !== key));
}
