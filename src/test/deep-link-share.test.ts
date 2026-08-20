import { describe, it, expect, vi, beforeEach } from "vitest";
import { getDealDeepLink, getVenueDeepLink } from "@/utils/shareUtils";
import { inferDeepLinkSurface } from "@/lib/deepLinkAnalytics";
import { resolvePushDeepLink } from "@/lib/pushDeepLink";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ insert: async () => ({ error: null }) }) },
}));

describe("stable JetCard deep links", () => {
  beforeEach(() => {
    // jsdom origin
    expect(window.location.origin).toBeTruthy();
  });

  it("builds id-based venue links that are stable across renames", () => {
    const a = getVenueDeepLink("venue-123");
    const b = getVenueDeepLink("venue-123");
    expect(a).toBe(b);
    expect(a).toContain("/?venue=venue-123");
  });

  it("encodes ids and appends share attribution", () => {
    const url = getVenueDeepLink("venue/with space", "user-9");
    expect(url).toContain("venue%2Fwith%20space");
    expect(url).toContain("ref=user-9");
  });

  it("builds deal links with attribution", () => {
    expect(getDealDeepLink("deal-1", "user-9")).toContain(
      "/?deal=deal-1&ref=user-9",
    );
  });
});

describe("push payload → JetCard deep link", () => {
  it("routes deal payloads to the deal JetCard", () => {
    expect(resolvePushDeepLink({ dealId: "deal-1" })).toBe("/?deal=deal-1");
  });

  it("routes venue payloads to the venue JetCard", () => {
    expect(resolvePushDeepLink({ venueId: "venue-1" })).toBe("/?venue=venue-1");
  });

  it("preserves map layer rehydration state", () => {
    expect(resolvePushDeepLink({ venueId: "v1", layers: "density,paths" })).toBe(
      "/?venue=v1&layers=density%2Cpaths",
    );
  });

  it("prefers an explicit url and keeps its query", () => {
    expect(
      resolvePushDeepLink({ url: "https://jet-around.com/?deal=d2&nid=n1" }),
    ).toBe("/?deal=d2&nid=n1");
  });

  it("falls back to the map for empty payloads", () => {
    expect(resolvePushDeepLink({})).toBe("/");
  });
});

describe("deep-link surface attribution", () => {
  it("detects push opens via the notification id param", () => {
    expect(inferDeepLinkSurface("?venue=v1&nid=n1")).toBe("push");
  });
  it("detects shared links via ref", () => {
    expect(inferDeepLinkSurface("?venue=v1&ref=u1")).toBe("share");
  });
  it("defaults to map", () => {
    expect(inferDeepLinkSurface("?venue=v1")).toBe("map");
  });
});
