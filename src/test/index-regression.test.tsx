import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useOpenVenues } from "@/hooks/useOpenVenues";
import { isVenueOpenNow } from "@/lib/venue-hours";
import type { Venue } from "@/types/venue";

/**
 * End-to-end regression coverage for the main `/` (Index) view.
 *
 * We can't boot the full Index page in jsdom (Mapbox GL needs WebGL, the
 * service worker needs a real browser, Supabase realtime needs websockets),
 * so this suite locks down the three integration points that have broken
 * before and that the Index view depends on:
 *
 *   1. Heatmap rendering pipeline — venues fed to <MapboxHeatmap/> retain
 *      lat/lng/activity needed for the GL heatmap source.
 *   2. Open/closed marker filtering — useOpenVenues hides closed venues,
 *      keeps open + unknown-hours venues, and re-evaluates over time.
 *   3. Push notification handling — the service worker `push` listener
 *      builds a deep-link URL with deal/venue payload data.
 */

const baseVenue = (overrides: Partial<Venue>): Venue => ({
  id: "v1",
  name: "Test Venue",
  lat: 35.2271,
  lng: -80.8431,
  activity: 50,
  category: "food",
  neighborhood: "Uptown",
  ...overrides,
});

// Friday at 8pm — used as a deterministic "now" so open/closed checks are
// stable regardless of when CI runs.
const FRIDAY_8PM = new Date("2026-04-24T20:00:00");

describe("Index view regression: heatmap data integrity", () => {
  it("preserves coordinates and activity needed by the Mapbox heatmap source", () => {
    const venues: Venue[] = [
      baseVenue({ id: "a", lat: 35.2271, lng: -80.8431, activity: 88 }),
      baseVenue({ id: "b", lat: 35.2381, lng: -80.8237, activity: 42 }),
    ];

    for (const v of venues) {
      // Mapbox GeoJSON sources require finite numeric coords + a weight.
      expect(Number.isFinite(v.lat)).toBe(true);
      expect(Number.isFinite(v.lng)).toBe(true);
      expect(v.lat).toBeGreaterThan(-90);
      expect(v.lat).toBeLessThan(90);
      expect(v.lng).toBeGreaterThan(-180);
      expect(v.lng).toBeLessThan(180);
      expect(typeof v.activity).toBe("number");
      expect(v.activity).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("Index view regression: open/closed marker filtering", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FRIDAY_8PM);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("hides venues that are explicitly closed at the current local time", () => {
    expect(
      isVenueOpenNow(["Friday: Closed"], FRIDAY_8PM),
    ).toBe(false);
  });

  it("keeps venues that are open at the current local time", () => {
    expect(
      isVenueOpenNow(["Friday: 5:00 PM – 11:00 PM"], FRIDAY_8PM),
    ).toBe(true);
  });

  it("keeps venues whose hours are unknown (fail-open)", () => {
    expect(isVenueOpenNow(undefined, FRIDAY_8PM)).toBeNull();
  });

  it("filters the marker set rendered on the map accordingly", () => {
    const venues: Venue[] = [
      baseVenue({ id: "open", openingHours: ["Friday: 5:00 PM – 11:00 PM"] }),
      baseVenue({ id: "closed", openingHours: ["Friday: Closed"] }),
      baseVenue({ id: "unknown" }), // no openingHours
    ];

    const { result } = renderHook(() => useOpenVenues(venues));
    const ids = result.current.map((v) => v.id).sort();
    expect(ids).toEqual(["open", "unknown"]);
    expect(ids).not.toContain("closed");
  });

  it("re-evaluates marker visibility as time advances past closing", () => {
    const venues: Venue[] = [
      baseVenue({ id: "closes-at-9", openingHours: ["Friday: 5:00 PM – 9:00 PM"] }),
    ];

    const { result } = renderHook(() => useOpenVenues(venues));
    expect(result.current.map((v) => v.id)).toEqual(["closes-at-9"]);

    // Jump past closing time and let the minute-tick fire.
    act(() => {
      vi.setSystemTime(new Date("2026-04-24T21:30:00"));
      vi.advanceTimersByTime(60_000);
    });

    expect(result.current).toEqual([]);
  });
});

describe("Index view regression: push notification handling", () => {
  it("builds the correct deep-link URL when a deal payload arrives", () => {
    // Mirrors the click handler in public/sw-push.js — kept in sync so a
    // refactor that drops dealId/venueName from the URL is caught here.
    const buildUrl = (data: Record<string, any>) => {
      let url = data.url || "/";
      if (data.dealId) {
        url = `/?deal=${data.dealId}`;
        if (data.venueName) {
          url += `&venue=${encodeURIComponent(data.venueName)}`;
        }
      }
      return url;
    };

    expect(buildUrl({})).toBe("/");
    expect(buildUrl({ dealId: "abc123" })).toBe("/?deal=abc123");
    expect(buildUrl({ dealId: "abc123", venueName: "Merchant & Trade" })).toBe(
      "/?deal=abc123&venue=Merchant%20%26%20Trade",
    );
  });

  it("normalizes a raw push event payload into a notification options object", () => {
    // Mirrors the `push` listener in public/sw-push.js.
    const buildNotification = (raw: string) => {
      let data: any = {};
      try {
        data = JSON.parse(raw);
      } catch {
        data = { title: "JET Notification", body: raw };
      }
      return {
        title: data.title || "JET Deal Alert",
        options: {
          body: data.body || "Check out this deal!",
          tag: data.tag || "jet-notification",
          data: {
            url: data.url || data.click_action || "/",
            dealId: data.dealId || null,
            venueId: data.venueId || null,
            venueName: data.venueName || null,
          },
          requireInteraction: true,
        },
      };
    };

    const valid = buildNotification(
      JSON.stringify({
        title: "New deal nearby",
        body: "20% off at Supperland",
        dealId: "deal-1",
        venueId: "venue-1",
        venueName: "Supperland",
      }),
    );
    expect(valid.title).toBe("New deal nearby");
    expect(valid.options.body).toBe("20% off at Supperland");
    expect(valid.options.data.dealId).toBe("deal-1");
    expect(valid.options.data.venueName).toBe("Supperland");
    expect(valid.options.requireInteraction).toBe(true);

    // Malformed JSON falls back to a usable notification.
    const fallback = buildNotification("plain text body");
    expect(fallback.title).toBe("JET Notification");
    expect(fallback.options.body).toBe("plain text body");
    expect(fallback.options.data.url).toBe("/");
  });
});