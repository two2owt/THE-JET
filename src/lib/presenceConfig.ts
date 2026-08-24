/**
 * Configurable presence timing.
 *
 * A user is shown as:
 *   • green  ("active")  — seen within `activeMs`
 *   • yellow ("recent")  — seen within `recentMs` (or connected but idle)
 *   • red    ("away")    — anything older, or not connected
 *
 * Defaults can be overridden at build time with Vite env vars, or at runtime
 * via `setPresenceThresholds()` (also exposed on `window.__jetPresence` so the
 * e2e suite can drive deterministic timings).
 */
export interface PresenceThresholds {
  /** Green window: last activity newer than this reads as "active now". */
  activeMs: number;
  /** Yellow window: last activity newer than this reads as "recently active". */
  recentMs: number;
  /** How often the signed-in user re-broadcasts their heartbeat. */
  heartbeatMs: number;
  /** How often buckets are re-evaluated so green decays on its own. */
  refreshMs: number;
}

function envInt(value: unknown, fallback: number): number {
  const n = typeof value === "string" ? Number.parseInt(value, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const DEFAULT_PRESENCE_THRESHOLDS: PresenceThresholds = {
  activeMs: envInt(import.meta.env["VITE_PRESENCE_ACTIVE_MS"], 5 * 60 * 1000),
  recentMs: envInt(import.meta.env["VITE_PRESENCE_RECENT_MS"], 15 * 60 * 1000),
  heartbeatMs: envInt(import.meta.env["VITE_PRESENCE_HEARTBEAT_MS"], 60 * 1000),
  refreshMs: envInt(import.meta.env["VITE_PRESENCE_REFRESH_MS"], 30 * 1000),
};

let thresholds: PresenceThresholds = { ...DEFAULT_PRESENCE_THRESHOLDS };

/** Status overrides keyed by user id — test/QA hook, purely presentational. */
let overrides: Record<string, "active" | "recent" | "away"> = {};

type Listener = () => void;
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((l) => l());
}

export function getPresenceThresholds(): PresenceThresholds {
  return thresholds;
}

export function setPresenceThresholds(next: Partial<PresenceThresholds>) {
  thresholds = { ...thresholds, ...next };
  notify();
}

export function resetPresenceThresholds() {
  thresholds = { ...DEFAULT_PRESENCE_THRESHOLDS };
  overrides = {};
  notify();
}

export function getPresenceOverrides() {
  return overrides;
}

export function setPresenceOverride(
  userId: string,
  status: "active" | "recent" | "away" | null,
) {
  if (status === null) {
    const { [userId]: _removed, ...rest } = overrides;
    overrides = rest;
  } else {
    overrides = { ...overrides, [userId]: status };
  }
  notify();
}

export function subscribePresenceConfig(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Runtime handle used by the e2e suite (and manual QA) to exercise the
// green/yellow/red transitions without waiting minutes of wall-clock time.
if (typeof window !== "undefined") {
  (
    window as unknown as { __jetPresence?: unknown }
  ).__jetPresence = {
    getThresholds: getPresenceThresholds,
    setThresholds: setPresenceThresholds,
    reset: resetPresenceThresholds,
    setStatus: setPresenceOverride,
  };
}
