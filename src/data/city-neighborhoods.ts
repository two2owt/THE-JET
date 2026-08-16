import { CITIES, getDistanceKm } from "@/types/cities";

export interface Neighborhood {
  name: string;
  lat: number;
  lng: number;
  /** Max distance from the center for a venue to be labeled with this neighborhood. */
  radiusKm: number;
}

/**
 * Neighborhood centers for every city in the city-selector dropdown.
 * Mirrors the original Charlotte-only mapping, generalized per city.
 */
export const CITY_NEIGHBORHOODS: Record<string, Neighborhood[]> = {
  charlotte: [
    { name: "Uptown", lat: 35.2271, lng: -80.8431, radiusKm: 2 },
    { name: "South End", lat: 35.2093, lng: -80.8583, radiusKm: 2.5 },
    { name: "NoDa", lat: 35.2497, lng: -80.8079, radiusKm: 2 },
    { name: "Plaza Midwood", lat: 35.2196, lng: -80.8079, radiusKm: 2 },
    { name: "Camp North End", lat: 35.2416, lng: -80.8323, radiusKm: 1.5 },
    { name: "Dilworth", lat: 35.2043, lng: -80.8484, radiusKm: 2 },
    { name: "SouthPark", lat: 35.1512, lng: -80.8318, radiusKm: 3 },
    { name: "University City", lat: 35.3079, lng: -80.7331, radiusKm: 4 },
  ],
  "new-york": [
    { name: "Midtown", lat: 40.7549, lng: -73.984, radiusKm: 2 },
    { name: "Lower East Side", lat: 40.715, lng: -73.9843, radiusKm: 1.5 },
    { name: "West Village", lat: 40.7358, lng: -74.0036, radiusKm: 1.5 },
    { name: "SoHo", lat: 40.7233, lng: -74.0020, radiusKm: 1.2 },
    { name: "Williamsburg", lat: 40.7081, lng: -73.9571, radiusKm: 2.5 },
    { name: "Harlem", lat: 40.8116, lng: -73.9465, radiusKm: 3 },
    { name: "Upper East Side", lat: 40.7736, lng: -73.9566, radiusKm: 2.5 },
    { name: "Financial District", lat: 40.7075, lng: -74.0113, radiusKm: 1.5 },
  ],
  "los-angeles": [
    { name: "Downtown LA", lat: 34.0407, lng: -118.2468, radiusKm: 3 },
    { name: "Hollywood", lat: 34.0928, lng: -118.3287, radiusKm: 3 },
    { name: "Silver Lake", lat: 34.0869, lng: -118.2702, radiusKm: 2.5 },
    { name: "Venice", lat: 33.985, lng: -118.4695, radiusKm: 3 },
    { name: "Santa Monica", lat: 34.0195, lng: -118.4912, radiusKm: 3.5 },
    { name: "Koreatown", lat: 34.0577, lng: -118.3009, radiusKm: 2.5 },
    { name: "West Hollywood", lat: 34.09, lng: -118.3617, radiusKm: 2.5 },
    { name: "Echo Park", lat: 34.0782, lng: -118.2606, radiusKm: 2 },
  ],
  chicago: [
    { name: "The Loop", lat: 41.8837, lng: -87.6289, radiusKm: 2 },
    { name: "River North", lat: 41.8925, lng: -87.6341, radiusKm: 1.5 },
    { name: "Wicker Park", lat: 41.9088, lng: -87.6796, radiusKm: 2 },
    { name: "Logan Square", lat: 41.9294, lng: -87.7073, radiusKm: 2.5 },
    { name: "Lincoln Park", lat: 41.9214, lng: -87.6513, radiusKm: 2.5 },
    { name: "West Loop", lat: 41.8825, lng: -87.6486, radiusKm: 1.8 },
    { name: "Hyde Park", lat: 41.7943, lng: -87.5907, radiusKm: 2.5 },
  ],
  miami: [
    { name: "Downtown Miami", lat: 25.7743, lng: -80.1937, radiusKm: 2 },
    { name: "Brickell", lat: 25.7601, lng: -80.1951, radiusKm: 1.8 },
    { name: "Wynwood", lat: 25.8006, lng: -80.1991, radiusKm: 1.8 },
    { name: "South Beach", lat: 25.7826, lng: -80.1341, radiusKm: 2.5 },
    { name: "Little Havana", lat: 25.7658, lng: -80.2199, radiusKm: 2 },
    { name: "Coconut Grove", lat: 25.7286, lng: -80.2434, radiusKm: 2.5 },
    { name: "Design District", lat: 25.8134, lng: -80.1928, radiusKm: 1.5 },
  ],
  austin: [
    { name: "Downtown", lat: 30.2672, lng: -97.7431, radiusKm: 2 },
    { name: "Rainey Street", lat: 30.2588, lng: -97.7383, radiusKm: 1 },
    { name: "East Austin", lat: 30.264, lng: -97.7178, radiusKm: 2.5 },
    { name: "South Congress", lat: 30.2489, lng: -97.7501, radiusKm: 2 },
    { name: "The Domain", lat: 30.4009, lng: -97.7256, radiusKm: 2 },
    { name: "Zilker", lat: 30.2669, lng: -97.7729, radiusKm: 2 },
    { name: "Hyde Park", lat: 30.3053, lng: -97.7297, radiusKm: 2 },
  ],
  denver: [
    { name: "Downtown / LoDo", lat: 39.7508, lng: -104.9993, radiusKm: 1.8 },
    { name: "RiNo", lat: 39.7692, lng: -104.9805, radiusKm: 2 },
    { name: "Capitol Hill", lat: 39.7328, lng: -104.9787, radiusKm: 2 },
    { name: "Highlands", lat: 39.7625, lng: -105.0143, radiusKm: 2.5 },
    { name: "Cherry Creek", lat: 39.7185, lng: -104.9528, radiusKm: 2 },
    { name: "Baker", lat: 39.7135, lng: -104.9903, radiusKm: 1.5 },
  ],
  seattle: [
    { name: "Downtown", lat: 47.6062, lng: -122.3321, radiusKm: 2 },
    { name: "Capitol Hill", lat: 47.6229, lng: -122.3122, radiusKm: 2 },
    { name: "Ballard", lat: 47.6685, lng: -122.3843, radiusKm: 2.5 },
    { name: "Fremont", lat: 47.6512, lng: -122.3505, radiusKm: 2 },
    { name: "Belltown", lat: 47.6142, lng: -122.3466, radiusKm: 1.5 },
    { name: "South Lake Union", lat: 47.6253, lng: -122.3372, radiusKm: 1.5 },
    { name: "West Seattle", lat: 47.5707, lng: -122.3865, radiusKm: 3 },
  ],
  atlanta: [
    { name: "Downtown", lat: 33.7537, lng: -84.3901, radiusKm: 2 },
    { name: "Midtown", lat: 33.7815, lng: -84.3835, radiusKm: 2 },
    { name: "Buckhead", lat: 33.8484, lng: -84.3733, radiusKm: 3 },
    { name: "Old Fourth Ward", lat: 33.7659, lng: -84.3673, radiusKm: 1.8 },
    { name: "West Midtown", lat: 33.7861, lng: -84.4126, radiusKm: 2 },
    { name: "East Atlanta", lat: 33.7401, lng: -84.3419, radiusKm: 2.5 },
    { name: "Little Five Points", lat: 33.7648, lng: -84.3496, radiusKm: 1.5 },
  ],
  nashville: [
    { name: "Downtown / Broadway", lat: 36.1612, lng: -86.7775, radiusKm: 1.5 },
    { name: "The Gulch", lat: 36.1519, lng: -86.7873, radiusKm: 1.2 },
    { name: "East Nashville", lat: 36.1785, lng: -86.7455, radiusKm: 2.5 },
    { name: "Germantown", lat: 36.1798, lng: -86.7885, radiusKm: 1.5 },
    { name: "12 South", lat: 36.1237, lng: -86.7896, radiusKm: 1.5 },
    { name: "Midtown", lat: 36.1508, lng: -86.8, radiusKm: 1.8 },
    { name: "Music Row", lat: 36.1489, lng: -86.7924, radiusKm: 1.2 },
  ],
};

/**
 * Resolve the neighborhood label for a venue in a given city.
 * Falls back to the city's display name when no neighborhood is close enough.
 */
export function getNeighborhoodForCoords(cityId: string, lat: number, lng: number): string {
  const city = CITIES.find((c) => c.id === cityId);
  const hoods = CITY_NEIGHBORHOODS[cityId] ?? [];

  let best: Neighborhood | null = null;
  let bestDistance = Infinity;

  for (const hood of hoods) {
    const distance = getDistanceKm(lat, lng, hood.lat, hood.lng);
    if (distance <= hood.radiusKm && distance < bestDistance) {
      best = hood;
      bestDistance = distance;
    }
  }

  return best?.name ?? city?.name ?? "Nearby";
}
