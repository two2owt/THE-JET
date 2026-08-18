export interface City {
  id: string;
  name: string;
  state: string;
  lat: number;
  lng: number;
  zoom: number;
  metroRadiusKm: number; // Radius in km to determine if user is "in" this metro area
}

// Calculate distance between two coordinates in km (Haversine formula)
export function getDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Check if user is within a city's metro area
export function isWithinMetro(
  userLat: number,
  userLng: number,
  city: City,
): boolean {
  const distance = getDistanceKm(userLat, userLng, city.lat, city.lng);
  return distance <= city.metroRadiusKm;
}

// Get cities user is currently within
export function getNearbyCities(userLat: number, userLng: number): City[] {
  return CITIES.filter((city) => isWithinMetro(userLat, userLng, city));
}

// Get the nearest city to user's location using Haversine distance
export function getNearestCity(userLat: number, userLng: number): City {
  let nearestCity = CITIES[0];
  let minDistance = Infinity;

  CITIES.forEach((city) => {
    const distance = getDistanceKm(userLat, userLng, city.lat, city.lng);
    if (distance < minDistance) {
      minDistance = distance;
      nearestCity = city;
    }
  });

  return nearestCity;
}

// Get cities sorted by distance from user's location (nearest first)
export function getCitiesSortedByDistance(
  userLat: number,
  userLng: number,
): Array<City & { distanceKm: number }> {
  return CITIES.map((city) => ({
    ...city,
    distanceKm: getDistanceKm(userLat, userLng, city.lat, city.lng),
  })).sort((a, b) => a.distanceKm - b.distanceKm);
}

// Convert km to miles
export function kmToMiles(km: number): number {
  return km * 0.621371;
}

export const CITIES: City[] = [
  {
    id: "charlotte",
    name: "Charlotte",
    state: "NC",
    lat: 35.227,
    lng: -80.843,
    zoom: 12,
    metroRadiusKm: 50,
  },
  {
    id: "new-york",
    name: "New York",
    state: "NY",
    lat: 40.7128,
    lng: -74.006,
    zoom: 12,
    metroRadiusKm: 60,
  },
  {
    id: "los-angeles",
    name: "Los Angeles",
    state: "CA",
    lat: 34.0522,
    lng: -118.2437,
    zoom: 11,
    metroRadiusKm: 80,
  },
  {
    id: "chicago",
    name: "Chicago",
    state: "IL",
    lat: 41.8781,
    lng: -87.6298,
    zoom: 12,
    metroRadiusKm: 60,
  },
  {
    id: "miami",
    name: "Miami",
    state: "FL",
    lat: 25.7617,
    lng: -80.1918,
    zoom: 12,
    metroRadiusKm: 50,
  },
  {
    id: "austin",
    name: "Austin",
    state: "TX",
    lat: 30.2672,
    lng: -97.7431,
    zoom: 12,
    metroRadiusKm: 45,
  },
  {
    id: "denver",
    name: "Denver",
    state: "CO",
    lat: 39.7392,
    lng: -104.9903,
    zoom: 12,
    metroRadiusKm: 50,
  },
  {
    id: "seattle",
    name: "Seattle",
    state: "WA",
    lat: 47.6062,
    lng: -122.3321,
    zoom: 12,
    metroRadiusKm: 50,
  },
  {
    id: "atlanta",
    name: "Atlanta",
    state: "GA",
    lat: 33.749,
    lng: -84.388,
    zoom: 12,
    metroRadiusKm: 55,
  },
  {
    id: "nashville",
    name: "Nashville",
    state: "TN",
    lat: 36.1627,
    lng: -86.7816,
    zoom: 12,
    metroRadiusKm: 45,
  },
];
