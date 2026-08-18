/**
 * Calculate distance between two geographic coordinates using the Haversine formula
 * @param lat1 Latitude of first point
 * @param lon1 Longitude of first point
 * @param lat2 Latitude of second point
 * @param lon2 Longitude of second point
 * @returns Distance in kilometers
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return distance;
}

/**
 * Convert degrees to radians
 */
function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Get dynamic radius based on area type
 * Urban areas get smaller radius, suburban/rural get larger
 */
export function getDynamicRadius(neighborhoodName?: string): number {
  // Default radius in kilometers
  const DEFAULT_RADIUS = 10;

  // Urban areas (smaller radius)
  const URBAN_RADIUS = 5;

  // Suburban areas (medium radius)
  const SUBURBAN_RADIUS = 15;

  // Rural areas (larger radius)
  const RURAL_RADIUS = 25;

  if (!neighborhoodName) return DEFAULT_RADIUS;

  const name = neighborhoodName.toLowerCase();

  // Urban keywords
  const urbanKeywords = ["downtown", "uptown", "center", "plaza", "district"];
  if (urbanKeywords.some((keyword) => name.includes(keyword))) {
    return URBAN_RADIUS;
  }

  // Suburban keywords
  const suburbanKeywords = ["south", "north", "east", "west", "hills", "park"];
  if (suburbanKeywords.some((keyword) => name.includes(keyword))) {
    return SUBURBAN_RADIUS;
  }

  // Default to rural for unmatched areas
  return RURAL_RADIUS;
}

/**
 * Format distance for display (in miles)
 */
export function formatDistance(distanceKm: number): string {
  const distanceMiles = distanceKm * 0.621371;
  if (distanceMiles < 0.1) {
    return `${Math.round(distanceMiles * 5280)}ft away`;
  }
  return `${distanceMiles.toFixed(1)}mi away`;
}
