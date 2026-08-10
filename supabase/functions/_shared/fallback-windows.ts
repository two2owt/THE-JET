/**
 * Configurable fallback-window ladder for the location layers.
 *
 * When the caller's requested time window returns nothing, the density /
 * movement-path functions progressively widen the window using this ladder.
 *
 * Configure without code changes via the `FALLBACK_WINDOW_MINUTES` secret:
 *   "1440,10080,43200,all"   (default — 24h, 7d, 30d, all-time)
 *   "60,720,all"             (1h, 12h, all-time)
 *   "1440"                   (only widen to 24h, never to all-time)
 *
 * Entries are minutes; the literal `all` (or `0` / `null`) means "no cutoff".
 * Invalid entries are ignored; an unusable value falls back to the default.
 */
export const DEFAULT_FALLBACK_WINDOW_MINUTES: (number | null)[] = [1440, 10080, 43200, null];

export function getFallbackWindowMinutes(
  envVar = 'FALLBACK_WINDOW_MINUTES',
): (number | null)[] {
  const raw = Deno.env.get(envVar);
  if (!raw) return DEFAULT_FALLBACK_WINDOW_MINUTES;

  const parsed: (number | null)[] = [];
  for (const token of raw.split(',')) {
    const t = token.trim().toLowerCase();
    if (!t) continue;
    if (t === 'all' || t === 'null' || t === '0') {
      parsed.push(null);
      continue;
    }
    const n = Number(t);
    if (Number.isFinite(n) && n >= 1) parsed.push(Math.floor(n));
  }

  if (parsed.length === 0) {
    console.warn(`[fallback-windows] Unusable ${envVar}="${raw}" — using defaults.`);
    return DEFAULT_FALLBACK_WINDOW_MINUTES;
  }
  return parsed;
}

/**
 * Builds the ordered list of cutoffs to try: the caller's own cutoff first,
 * then each configured fallback window that is strictly wider than it.
 */
export function buildCutoffLadder(now: Date, primaryCutoff: Date | null): (Date | null)[] {
  const minutesSince = (d: Date | null) =>
    d === null ? Number.POSITIVE_INFINITY : Math.round((now.getTime() - d.getTime()) / 60_000);

  const fallbacks = getFallbackWindowMinutes().map((m) =>
    m === null ? null : new Date(now.getTime() - m * 60_000),
  );

  return [primaryCutoff, ...fallbacks].filter(
    (c, i) => i === 0 || minutesSince(c) > minutesSince(primaryCutoff),
  );
}
