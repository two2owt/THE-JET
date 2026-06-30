import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useMemo, useState, useEffect } from "react";
import { buildVenueOpenStatus, type VenueOpenInput } from "../venue-open-cache";

// A Monday 10:00 local time → "Monday: 9:00 AM – 5:00 PM" is OPEN.
const MONDAY_10AM = new Date(2025, 0, 6, 10, 0, 0); // Jan 6 2025 is a Monday
const MONDAY_8PM = new Date(2025, 0, 6, 20, 0, 0);

const WEEKDAY_9_TO_5 = [
  "Monday: 9:00 AM – 5:00 PM",
  "Tuesday: 9:00 AM – 5:00 PM",
  "Wednesday: 9:00 AM – 5:00 PM",
  "Thursday: 9:00 AM – 5:00 PM",
  "Friday: 9:00 AM – 5:00 PM",
  "Saturday: Closed",
  "Sunday: Closed",
];

const venues: VenueOpenInput[] = [
  { id: "open", openingHours: WEEKDAY_9_TO_5 },
  { id: "explicit-true", isOpen: true, openingHours: WEEKDAY_9_TO_5 },
  { id: "explicit-false", isOpen: false, openingHours: WEEKDAY_9_TO_5 },
  { id: "unknown", openingHours: undefined },
  { id: "garbage", openingHours: ["???"] },
];

describe("buildVenueOpenStatus — pure cache builder", () => {
  it("returns a Map keyed by venue id with one entry per input venue", () => {
    const cache = buildVenueOpenStatus(venues, MONDAY_10AM);
    expect(cache).toBeInstanceOf(Map);
    expect(cache.size).toBe(venues.length);
    for (const v of venues) expect(cache.has(v.id)).toBe(true);
  });

  it("classifies open / closed / unknown correctly", () => {
    const cache = buildVenueOpenStatus(venues, MONDAY_10AM);
    expect(cache.get("open")).toBe(true);
    expect(cache.get("unknown")).toBe(null);
    expect(cache.get("garbage")).toBe(null);
  });

  it("prefers explicit `isOpen` over weekday_text parsing", () => {
    const cache = buildVenueOpenStatus(venues, MONDAY_10AM);
    // Both have hours saying OPEN at 10am, but explicit flag wins.
    expect(cache.get("explicit-true")).toBe(true);
    expect(cache.get("explicit-false")).toBe(false);
  });

  it("recomputes correctly when the clock advances past closing time", () => {
    const morning = buildVenueOpenStatus(venues, MONDAY_10AM);
    const evening = buildVenueOpenStatus(venues, MONDAY_8PM);
    expect(morning.get("open")).toBe(true);
    expect(evening.get("open")).toBe(false);
    // Unknown stays unknown regardless of time.
    expect(morning.get("unknown")).toBe(null);
    expect(evening.get("unknown")).toBe(null);
  });

  it("produces a fresh Map instance every call (no shared mutable state)", () => {
    const a = buildVenueOpenStatus(venues, MONDAY_10AM);
    const b = buildVenueOpenStatus(venues, MONDAY_10AM);
    expect(a).not.toBe(b);
    // Identical contents though.
    for (const [k, v] of a) expect(b.get(k)).toBe(v);
  });
});

/**
 * Mirror of the `useMemo([venues, openNowTick])` pattern in MapboxHeatmap so we
 * can prove that the cache is stable across unrelated re-renders and only
 * rebuilds when `venues` changes or the 60 s tick fires.
 */
function useVenueOpenStatus(venues: VenueOpenInput[], tickIntervalMs = 60_000) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), tickIntervalMs);
    return () => clearInterval(id);
  }, [tickIntervalMs]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => buildVenueOpenStatus(venues), [venues, tick]);
}

describe("venueOpenStatus memo behavior (mirrors MapboxHeatmap)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("returns the same Map reference across unrelated re-renders", () => {
    const initial = [...venues];
    const { result, rerender } = renderHook(({ v }) => useVenueOpenStatus(v), {
      initialProps: { v: initial },
    });
    const first = result.current;
    rerender({ v: initial }); // same array identity → cache must be stable
    rerender({ v: initial });
    rerender({ v: initial });
    expect(result.current).toBe(first);
  });

  it("rebuilds when the venues array identity changes", () => {
    const { result, rerender } = renderHook(({ v }) => useVenueOpenStatus(v), {
      initialProps: { v: [...venues] },
    });
    const first = result.current;
    rerender({ v: [...venues] }); // new array identity
    expect(result.current).not.toBe(first);
    // Contents still consistent.
    expect(result.current.get("unknown")).toBe(null);
  });

  it("rebuilds when the 60 s tick fires", () => {
    const stable = [...venues];
    const { result, rerender } = renderHook(() => useVenueOpenStatus(stable));
    const first = result.current;

    // Advance one full minute — the interval should fire and bump the tick.
    vi.advanceTimersByTime(60_000);
    rerender();
    expect(result.current).not.toBe(first);
  });

  it("does NOT rebuild before the 60 s tick fires", () => {
    const stable = [...venues];
    const { result, rerender } = renderHook(() => useVenueOpenStatus(stable));
    const first = result.current;

    vi.advanceTimersByTime(59_000);
    rerender();
    expect(result.current).toBe(first);
  });
});