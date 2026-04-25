import { describe, it, expect } from "vitest";
import { buildDirectionsUrl } from "@/lib/directions-url";
import type { Venue } from "@/types/venue";

const fullVenue: Pick<Venue, "lat" | "lng" | "address" | "name"> = {
  name: "The Optimist",
  address: "1115 N Brevard St, Charlotte, NC 28206",
  lat: 35.235,
  lng: -80.815,
};

const addressOnlyVenue: Pick<Venue, "lat" | "lng" | "address" | "name"> = {
  name: "Plaza Midwood Bar",
  address: "1929 Commonwealth Ave, Charlotte, NC 28205",
  lat: NaN,
  lng: NaN,
};

const nameOnlyVenue: Pick<Venue, "lat" | "lng" | "address" | "name"> = {
  name: "Mystery Spot",
  address: undefined,
  lat: NaN,
  lng: NaN,
};

const emptyVenue: Pick<Venue, "lat" | "lng" | "address" | "name"> = {
  name: "",
  address: undefined,
  lat: NaN,
  lng: NaN,
};

describe("buildDirectionsUrl — Google Maps", () => {
  it("uses lat,lng with driving travelmode when coords are valid", () => {
    const url = buildDirectionsUrl("google", fullVenue);
    expect(url).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=35.235,-80.815&travelmode=driving",
    );
  });

  it("falls back to encoded address when coords are missing/invalid", () => {
    const url = buildDirectionsUrl("google", addressOnlyVenue);
    expect(url).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=1929%20Commonwealth%20Ave%2C%20Charlotte%2C%20NC%2028205&travelmode=driving",
    );
  });

  it("falls back to a search URL with the venue name when only the name is known", () => {
    const url = buildDirectionsUrl("google", nameOnlyVenue);
    expect(url).toBe(
      "https://www.google.com/maps/search/?api=1&query=Mystery%20Spot",
    );
  });
});

describe("buildDirectionsUrl — Apple Maps", () => {
  it("uses daddr=lat,lng with q=name and dirflg=d when coords are valid", () => {
    const url = buildDirectionsUrl("apple", fullVenue);
    expect(url).toBe(
      "https://maps.apple.com/?daddr=35.235,-80.815&q=The%20Optimist&dirflg=d",
    );
  });

  it("falls back to encoded address with q=name when coords are missing", () => {
    const url = buildDirectionsUrl("apple", addressOnlyVenue);
    expect(url).toBe(
      "https://maps.apple.com/?daddr=1929%20Commonwealth%20Ave%2C%20Charlotte%2C%20NC%2028205&q=Plaza%20Midwood%20Bar&dirflg=d",
    );
  });

  it("falls back to a search query when only the name is known", () => {
    const url = buildDirectionsUrl("apple", nameOnlyVenue);
    expect(url).toBe("https://maps.apple.com/?q=Mystery%20Spot");
  });
});

describe("buildDirectionsUrl — Waze", () => {
  it("uses ll=lat,lng with navigate=yes and zoom when coords are valid", () => {
    const url = buildDirectionsUrl("waze", fullVenue);
    expect(url).toBe(
      "https://www.waze.com/ul?ll=35.235%2C-80.815&navigate=yes&zoom=17",
    );
  });

  it("falls back to q=address when coords are missing", () => {
    const url = buildDirectionsUrl("waze", addressOnlyVenue);
    expect(url).toBe(
      "https://www.waze.com/ul?q=1929%20Commonwealth%20Ave%2C%20Charlotte%2C%20NC%2028205&navigate=yes",
    );
  });

  it("falls back to q=name when only the name is known", () => {
    const url = buildDirectionsUrl("waze", nameOnlyVenue);
    expect(url).toBe("https://www.waze.com/ul?q=Mystery%20Spot&navigate=yes");
  });
});

describe("buildDirectionsUrl — invalid coordinate handling", () => {
  it("rejects out-of-range latitude and falls back to address", () => {
    const url = buildDirectionsUrl("google", {
      name: "Bad Lat",
      address: "123 Main St",
      lat: 95,
      lng: -80,
    });
    expect(url).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=123%20Main%20St&travelmode=driving",
    );
  });

  it("rejects out-of-range longitude and falls back to address", () => {
    const url = buildDirectionsUrl("apple", {
      name: "Bad Lng",
      address: "123 Main St",
      lat: 35,
      lng: 200,
    });
    expect(url).toBe(
      "https://maps.apple.com/?daddr=123%20Main%20St&q=Bad%20Lng&dirflg=d",
    );
  });

  it("rejects non-finite coordinates", () => {
    const url = buildDirectionsUrl("waze", {
      name: "Infinity Spot",
      address: "456 Side St",
      lat: Infinity,
      lng: -80,
    });
    expect(url).toBe(
      "https://www.waze.com/ul?q=456%20Side%20St&navigate=yes",
    );
  });
});

describe("buildDirectionsUrl — missing data", () => {
  it("returns null when venue is null", () => {
    expect(buildDirectionsUrl("google", null)).toBeNull();
  });

  it("returns null when venue is undefined", () => {
    expect(buildDirectionsUrl("apple", undefined)).toBeNull();
  });

  it("returns null when venue has no coords, address, or name", () => {
    expect(buildDirectionsUrl("waze", emptyVenue)).toBeNull();
    expect(buildDirectionsUrl("google", emptyVenue)).toBeNull();
    expect(buildDirectionsUrl("apple", emptyVenue)).toBeNull();
  });
});