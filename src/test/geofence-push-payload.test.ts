import { describe, it, expect } from "vitest";
import { buildDataPayload } from "../../supabase/functions/_shared/notifications.ts";
import { resolvePushDeepLink } from "@/lib/pushDeepLink";

/**
 * Contract test for the check-geofence -> notification_queue -> dispatch ->
 * service worker chain. check-geofence writes the queue row's `data.url`;
 * notifications-dispatch expands it with buildDataPayload; the service worker
 * resolves the tap target with resolvePushDeepLink. All three must agree.
 */
const DEAL_ID = "bc55e066-a70e-4d5f-a548-dbc0a712cddc";
const QUEUE_ID = "4cdaa5ed-756f-44a5-98d8-7ecbdec27e59";

// Exactly what check-geofence inserts into notification_queue.data
const geofenceQueueData = {
  venueName: "JET Internal Test Venue",
  neighborhoodId: "5754a9a6-9caf-4c3b-8e36-0a425237ddf0",
  layers: "",
  url: `https://www.jet-around.com/?deal=${DEAL_ID}`,
};

describe("geofence push payload + deep link", () => {
  const payload = buildDataPayload({
    queueId: QUEUE_ID,
    dealId: DEAL_ID,
    venueId: null,
    venueName: geofenceQueueData.venueName,
    layers: geofenceQueueData.layers,
    url: geofenceQueueData.url,
    category: "deals",
  });

  it("carries the queue id so receipts can be attributed", () => {
    expect(payload.notificationId).toBe(QUEUE_ID);
  });

  it("carries the deal id, venue name and category", () => {
    expect(payload.dealId).toBe(DEAL_ID);
    expect(payload.venueName).toBe("JET Internal Test Venue");
    expect(payload.category).toBe("deals");
    expect(payload.venueId).toBe("");
  });

  it("preserves the geofence deep link verbatim", () => {
    expect(payload.url).toBe(`https://www.jet-around.com/?deal=${DEAL_ID}`);
  });

  it("resolves to the in-app deal route on tap", () => {
    expect(resolvePushDeepLink(payload)).toBe(`/?deal=${DEAL_ID}`);
  });

  it("falls back to a deal link when the queue row omits url", () => {
    const p = buildDataPayload({ queueId: QUEUE_ID, dealId: DEAL_ID });
    expect(p.url).toBe(`https://www.jet-around.com/?deal=${DEAL_ID}`);
    expect(resolvePushDeepLink(p)).toBe(`/?deal=${DEAL_ID}`);
  });

  it("keeps map layer state when present", () => {
    const p = buildDataPayload({
      queueId: QUEUE_ID,
      dealId: DEAL_ID,
      layers: "density,paths",
    });
    expect(resolvePushDeepLink(p)).toBe(
      `/?deal=${DEAL_ID}&layers=density%2Cpaths`,
    );
  });

  it("never emits null/undefined values into the push data payload", () => {
    for (const [k, v] of Object.entries(payload)) {
      expect(typeof v, k).toBe("string");
    }
  });
});
