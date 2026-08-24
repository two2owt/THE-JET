import { describe, expect, it } from "vitest";
import {
  dealMatchesPreferences,
  resolveDealPreferenceBucket,
} from "@/lib/dealCategory";

describe("deal preference buckets", () => {
  it("infers Drinks from a generic 'offer' at a bar", () => {
    const deal = {
      deal_type: "offer",
      title: "Half-off cocktails",
      description: "Happy hour at the bar",
      venue_name: "The Tavern",
    };
    expect(resolveDealPreferenceBucket(deal)).toBe("Drinks");
    expect(dealMatchesPreferences(deal, ["Drinks"])).toBe(true);
    expect(dealMatchesPreferences(deal, ["Food"])).toBe(false);
  });

  it("buckets live music 'event' deals into Events", () => {
    const deal = {
      deal_type: "event",
      title: "Live music tonight",
      description: "Local band takes the stage",
      venue_name: "Music Hall",
    };
    expect(resolveDealPreferenceBucket(deal)).toBe("Events");
  });

  it("buckets a coffee 'special' into Drinks", () => {
    expect(
      resolveDealPreferenceBucket({
        deal_type: "special",
        title: "$2 espresso",
        description: "Morning special",
        venue_name: "Bean Cafe",
      }),
    ).toBe("Drinks");
  });

  it("falls back to Food for unclassifiable deals", () => {
    expect(
      resolveDealPreferenceBucket({
        deal_type: "offer",
        title: "20% off",
        description: "Today only",
        venue_name: "Corner Spot",
      }),
    ).toBe("Food");
  });

  it("matches everything when the user selected no categories", () => {
    expect(dealMatchesPreferences({ deal_type: "offer" }, [])).toBe(true);
    expect(dealMatchesPreferences({ deal_type: "offer" }, null)).toBe(true);
  });

  it("respects an explicit merchant venue_category", () => {
    expect(
      resolveDealPreferenceBucket({
        deal_type: "offer",
        venue_category: "nightclub",
        title: "Free cover",
      }),
    ).toBe("Nightlife");
  });
});
