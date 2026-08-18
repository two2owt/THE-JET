import type { Venue } from "@/types/venue";

export type DirectionsApp = "google" | "apple" | "waze";

/**
 * Pure builder for navigation deep-links.
 * Returns `null` when the venue has no usable location data (no coords, no
 * address, and no name). Kept side-effect-free so it can be unit-tested
 * without DOM, window.open, or toast mocks.
 */
export function buildDirectionsUrl(
  app: DirectionsApp,
  venue: Pick<Venue, "lat" | "lng" | "address" | "name"> | null | undefined,
  options?: { placeId?: string | null },
): string | null {
  if (!venue) return null;

  const { lat, lng, address, name } = venue;

  const hasCoords =
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180;

  const hasLabel = Boolean(name || address);
  if (!hasCoords && !address && !name) return null;

  const label = encodeURIComponent(name || address || "Destination");
  const addressQuery = address ? encodeURIComponent(address) : "";
  // Google place IDs look like "ChIJ..." — anything else (our own UUIDs or
  // "lat,lng" fallbacks) must not be sent as destination_place_id.
  const rawPlaceId = options?.placeId ?? undefined;
  const placeId =
    rawPlaceId &&
    /^[A-Za-z0-9_-]{10,}$/.test(rawPlaceId) &&
    rawPlaceId.startsWith("ChIJ")
      ? encodeURIComponent(rawPlaceId)
      : "";

  switch (app) {
    case "google":
      if (hasCoords) {
        // destination_place_id must be paired with a destination value; adding it
        // makes Google resolve the exact POI instead of a bare pin.
        return (
          `https://www.google.com/maps/dir/?api=1&destination=${lat}%2C${lng}` +
          (placeId ? `&destination_place_id=${placeId}` : "") +
          `&travelmode=driving&dir_action=navigate`
        );
      }
      if (addressQuery) {
        return (
          `https://www.google.com/maps/dir/?api=1&destination=${addressQuery}` +
          (placeId ? `&destination_place_id=${placeId}` : "") +
          `&travelmode=driving&dir_action=navigate`
        );
      }
      return (
        `https://www.google.com/maps/search/?api=1&query=${label}` +
        (placeId ? `&query_place_id=${placeId}` : "")
      );
    case "apple":
      if (hasCoords) {
        // Apple Maps: `daddr` drives navigation, `q` labels the pin and `ll`
        // anchors the map so the label doesn't get geocoded somewhere else.
        return `https://maps.apple.com/?daddr=${lat}%2C${lng}&ll=${lat}%2C${lng}&q=${label}&dirflg=d&t=m`;
      }
      if (addressQuery) {
        return `https://maps.apple.com/?daddr=${addressQuery}&q=${label}&dirflg=d&t=m`;
      }
      return `https://maps.apple.com/?q=${label}`;
    case "waze":
      if (hasCoords) {
        // Waze universal link: `ll` + `navigate=yes` starts turn-by-turn; `q`
        // keeps the destination name visible in the app.
        return `https://www.waze.com/ul?ll=${lat}%2C${lng}&navigate=yes&zoom=17${
          name || address ? `&q=${label}` : ""
        }`;
      }
      if (addressQuery) {
        return `https://www.waze.com/ul?q=${addressQuery}&navigate=yes`;
      }
      return `https://www.waze.com/ul?q=${label}&navigate=yes`;
  }

  // Unreachable, but keeps TypeScript happy if the union ever grows.
  void hasLabel;
  return null;
}
