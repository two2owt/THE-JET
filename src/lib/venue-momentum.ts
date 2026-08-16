/**
 * Momentum-based venue scoring (second pass over the raw activity score).
 *
 * Raw activity is a *volume* signal: a big venue is always "busy", a small one
 * never is. Momentum instead answers "is this place filling up right now?" by
 * comparing the latest sample against the venue's own recent baseline.
 *
 * Three properties matter:
 *  - Venue-relative baseline (EWMA): a coffee shop at 55 can be peaking while a
 *    nightclub at 55 is dead.
 *  - Hard decay: samples lose weight with a 25-minute half-life, so a burst an
 *    hour ago barely counts.
 *  - Honesty: with fewer than two samples we return `unknown`, never a guess.
 */

export type MomentumTrend = "rising" | "peaking" | "falling" | "steady" | "unknown";

export interface MomentumResult {
  /** -100 (emptying fast) .. +100 (filling fast). 0 when unknown. */
  score: number;
  trend: MomentumTrend;
  /** Human label for JetCards / markers. */
  label: string;
  /** Score after momentum adjustment, clamped 0-100. */
  adjustedActivity: number;
}

interface VenueSample {
  /** Exponentially weighted baseline of the venue's own activity. */
  baseline: number;
  /** Last observed raw activity. */
  last: number;
  /** Epoch ms of the last sample. */
  at: number;
  /** Number of samples seen (capped, only used for the confidence gate). */
  n: number;
}

const STORAGE_KEY = "jet.venue.momentum.v1";
/** Momentum half-life — a delta is worth half as much after this long. */
const HALF_LIFE_MS = 25 * 60 * 1000;
/** Samples older than this are treated as a cold start. */
const MAX_AGE_MS = 6 * 60 * 60 * 1000;
/** EWMA smoothing for the per-venue baseline (lower = slower baseline). */
const BASELINE_ALPHA = 0.25;
/** How much momentum is allowed to move the displayed activity score. */
const MAX_ACTIVITY_ADJUSTMENT = 12;

type SampleMap = Record<string, VenueSample>;

let memory: SampleMap | null = null;

function load(): SampleMap {
  if (memory) return memory;
  memory = {};
  if (typeof window === "undefined") return memory;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SampleMap;
      const now = Date.now();
      for (const [id, sample] of Object.entries(parsed)) {
        if (sample && typeof sample.at === "number" && now - sample.at < MAX_AGE_MS) {
          memory[id] = sample;
        }
      }
    }
  } catch {
    // Corrupt or unavailable storage: cold start is a valid state.
  }
  return memory;
}

function persist(map: SampleMap) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Quota / private mode — in-memory momentum still works for the session.
  }
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

function labelFor(trend: MomentumTrend, activity: number): string {
  switch (trend) {
    case "rising":
      return "Filling up";
    case "peaking":
      return "Peaking";
    case "falling":
      return "Winding down";
    case "steady":
      return activity >= 60 ? "Holding steady" : "Quiet and steady";
    default:
      return "Not enough data yet";
  }
}

/**
 * Record a new activity reading for a venue and return its momentum.
 * Call once per refresh cycle per venue.
 */
export function scoreVenueMomentum(
  venueId: string,
  activity: number,
  now: number = Date.now(),
): MomentumResult {
  const raw = clamp(activity, 0, 100);
  const map = load();
  const prev = map[venueId];

  let score = 0;
  let trend: MomentumTrend = "unknown";

  if (prev && now - prev.at < MAX_AGE_MS) {
    // Decay weight of the comparison by elapsed time.
    const elapsed = Math.max(0, now - prev.at);
    const weight = Math.pow(0.5, elapsed / HALF_LIFE_MS);

    // Two signals: change since the last sample, and distance from the venue's
    // own baseline. Both are venue-relative, so venue size cancels out.
    const delta = raw - prev.last;
    const vsBaseline = raw - prev.baseline;
    score = clamp((delta * 2.5 + vsBaseline * 1.5) * weight, -100, 100);

    if (prev.n >= 1) {
      if (score >= 8 && raw >= 70) trend = "peaking";
      else if (score >= 8) trend = "rising";
      else if (score <= -8) trend = "falling";
      else trend = "steady";
    }
  }

  map[venueId] = {
    baseline: prev ? prev.baseline * (1 - BASELINE_ALPHA) + raw * BASELINE_ALPHA : raw,
    last: raw,
    at: now,
    n: Math.min(50, (prev?.n ?? 0) + 1),
  };
  persist(map);

  const adjustedActivity = clamp(
    raw + clamp(score / 100, -1, 1) * MAX_ACTIVITY_ADJUSTMENT,
    0,
    100,
  );

  return {
    score: Math.round(score),
    trend,
    label: labelFor(trend, adjustedActivity),
    adjustedActivity: Math.round(adjustedActivity),
  };
}
