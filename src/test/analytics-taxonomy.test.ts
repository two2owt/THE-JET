import { describe, it, expect } from "vitest";
import {
  ANALYTICS_EVENTS,
  GTM_FUNNEL_STEPS,
} from "@/lib/analyticsEvents";

/**
 * The GTM funnel keys off exact event names. Renaming one silently breaks
 * historical reporting, so the contract is pinned here.
 */
describe("analytics event taxonomy", () => {
  it("uses snake_case names only", () => {
    for (const name of Object.values(ANALYTICS_EVENTS)) {
      expect(name, `${name} must be snake_case`).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it("has no duplicate names", () => {
    const names = Object.values(ANALYTICS_EVENTS);
    expect(new Set(names).size).toBe(names.length);
  });

  it("exposes the canonical engagement events the funnel requires", () => {
    expect(ANALYTICS_EVENTS.FAVORITE_DEAL).toBe("favorite_deal");
    expect(ANALYTICS_EVENTS.UNFAVORITE_DEAL).toBe("unfavorite_deal");
    expect(ANALYTICS_EVENTS.SHARE_DEAL).toBe("share_deal");
  });

  it("orders the funnel from acquisition through monetization", () => {
    expect(GTM_FUNNEL_STEPS[0]).toBe(ANALYTICS_EVENTS.PAGE_VIEW);
    expect(GTM_FUNNEL_STEPS.at(-1)).toBe(ANALYTICS_EVENTS.SUBSCRIPTION_ACTIVE);
    expect(GTM_FUNNEL_STEPS).toContain(ANALYTICS_EVENTS.FAVORITE_DEAL);
    expect(GTM_FUNNEL_STEPS).toContain(ANALYTICS_EVENTS.SHARE_DEAL);
  });
});
