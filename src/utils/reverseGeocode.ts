/**
 * Reverse geocoding utility using Mapbox API
 * Returns city/metropolitan area name from coordinates
 */

export interface GeocodedLocation {
  city: string;
  state: string;
  country: string;
  fullName: string; // "City, State" or "City, Country"
  metroArea?: string; // Metropolitan area if available
}

/**
 * Reverse geocode coordinates to get city/metro area name
 * Uses Mapbox Geocoding API
 */
export async function reverseGeocode(
  lat: number,
  lng: number,
  mapboxToken: string,
): Promise<GeocodedLocation | null> {
  try {
    const response = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?types=place,locality,region&access_token=${mapboxToken}`,
    );

    if (!response.ok) {
      console.error("Reverse geocoding failed:", response.status);
      return null;
    }

    const data = await response.json();

    if (!data.features || data.features.length === 0) {
      return null;
    }

    // Extract city/place from features
    let city = "";
    let state = "";
    let country = "";
    let metroArea = "";

    for (const feature of data.features) {
      const placeType = feature.place_type?.[0];

      if (placeType === "place" || placeType === "locality") {
        city = feature.text || feature.place_name?.split(",")[0] || "";

        // Extract state and country from context
        if (feature.context) {
          for (const ctx of feature.context) {
            if (ctx.id?.startsWith("region")) {
              // Get state abbreviation if available, otherwise full name
              state = ctx.short_code?.replace("US-", "") || ctx.text || "";
            }
            if (ctx.id?.startsWith("country")) {
              country = ctx.short_code || ctx.text || "";
            }
          }
        }
      }

      // Check for metropolitan area in properties
      if (feature.properties?.wikidata || feature.properties?.short_code) {
        metroArea = feature.text;
      }
    }

    // If no city found, try to get from the first feature
    if (!city && data.features[0]) {
      const firstFeature = data.features[0];
      city =
        firstFeature.text ||
        firstFeature.place_name?.split(",")[0] ||
        "Unknown";
    }

    // Build full name
    let fullName = city;
    if (state) {
      fullName = `${city}, ${state}`;
    } else if (country && country !== "US") {
      fullName = `${city}, ${country}`;
    }

    return {
      city,
      state,
      country,
      fullName,
      metroArea: metroArea || undefined,
    };
  } catch (error) {
    console.error("Reverse geocoding error:", error);
    return null;
  }
}

/**
 * Cache for reverse geocoding results to avoid repeated API calls
 */
const geocodeCache = new Map<string, GeocodedLocation>();

/**
 * Get cached or fetch reverse geocoding result
 * Uses a grid-based cache key to reduce API calls for nearby locations
 */
export async function getCachedReverseGeocode(
  lat: number,
  lng: number,
  mapboxToken: string,
): Promise<GeocodedLocation | null> {
  // Round to ~1km precision for cache key (reduces API calls)
  const cacheKey = `${lat.toFixed(2)},${lng.toFixed(2)}`;

  if (geocodeCache.has(cacheKey)) {
    return geocodeCache.get(cacheKey)!;
  }

  const result = await reverseGeocode(lat, lng, mapboxToken);

  if (result) {
    geocodeCache.set(cacheKey, result);
    // Limit cache size
    if (geocodeCache.size > 100) {
      const firstKey = geocodeCache.keys().next().value;
      if (firstKey) geocodeCache.delete(firstKey);
    }
  }

  return result;
}
