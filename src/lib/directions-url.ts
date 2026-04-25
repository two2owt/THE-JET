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

  switch (app) {
    case "google":
      if (hasCoords) {
        return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
      }
      if (addressQuery) {
        return `https://www.google.com/maps/dir/?api=1&destination=${addressQuery}&travelmode=driving`;
      }
      return `https://www.google.com/maps/search/?api=1&query=${label}`;
    case "apple":
      if (hasCoords) {
        return `https://maps.apple.com/?daddr=${lat},${lng}&q=${label}&dirflg=d`;
      }
      if (addressQuery) {
        return `https://maps.apple.com/?daddr=${addressQuery}&q=${label}&dirflg=d`;
      }
      return `https://maps.apple.com/?q=${label}`;
    case "waze":
      if (hasCoords) {
        return `https://www.waze.com/ul?ll=${lat}%2C${lng}&navigate=yes&zoom=17`;
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