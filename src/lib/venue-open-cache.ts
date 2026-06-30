import { isVenueOpenNow } from "./venue-hours";

/** Minimum venue shape needed to compute open/closed status. */
export interface VenueOpenInput {
  id: string;
  /** Pre-resolved status (e.g. from Google `open_now`). Takes precedence when not null/undefined. */
  isOpen?: boolean | null;
  /** Google Places `weekday_text` lines. */
  openingHours?: readonly string[];
}

/**
 * Build the `venueId → open|closed|unknown` cache consumed by the map.
 *
 * - `true`  → venue is open right now
 * - `false` → venue is closed right now
 * - `null`  → hours unknown / unparseable (keep the marker visible, no pill)
 *
 * Pure and deterministic for a given (venues, now) input, so it can be memoised
 * with `useMemo([venues, openNowTick])` and re-evaluated on the 60 s tick.
 */
export function buildVenueOpenStatus(
  venues: readonly VenueOpenInput[],
  now: Date = new Date(),
): Map<string, boolean | null> {
  const m = new Map<string, boolean | null>();
  for (const v of venues) {
    const status =
      (v.isOpen ?? null) !== null
        ? (v.isOpen as boolean)
        : isVenueOpenNow(v.openingHours, now);
    m.set(v.id, status);
  }
  return m;
}