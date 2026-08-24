/**
 * Forward geocoding utility using the Mapbox Geocoding API.
 * Resolves free-text queries (e.g. "Austin", "Boise, ID") to US cities so the
 * map can jump to places that are not part of the curated CITIES list.
 */

import type { City } from "@/types/cities";

export interface GeocodedCity extends City {
  /** Full label returned by Mapbox, e.g. "Austin, Texas, United States" */
  placeName: string;
  remote: true;
}

const STATE_ABBREVIATIONS: Record<string, string> = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  "district of columbia": "DC",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
};

const toStateCode = (value: string): string => {
  if (!value) return "";
  if (value.length === 2) return value.toUpperCase();
  return STATE_ABBREVIATIONS[value.toLowerCase()] ?? value.slice(0, 2).toUpperCase();
};

/**
 * Search US cities/towns by free text. Returns at most `limit` matches.
 * Never throws — resolves to an empty array on any failure.
 */
export async function searchUsCities(
  query: string,
  mapboxToken: string,
  limit = 5,
  signal?: AbortSignal,
): Promise<GeocodedCity[]> {
  const q = query.trim();
  if (!q || !mapboxToken) return [];

  try {
    const response = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json` +
        `?types=place,locality&country=us&limit=${limit}&access_token=${mapboxToken}`,
      { signal },
    );
    if (!response.ok) return [];

    const data = await response.json();
    const features: unknown[] = Array.isArray(data?.features) ? data.features : [];

    return features
      .map((raw) => {
        const feature = raw as {
          id?: string;
          text?: string;
          place_name?: string;
          center?: [number, number];
          context?: { id?: string; text?: string; short_code?: string }[];
        };
        const center = feature.center;
        if (!center || center.length < 2) return null;

        const regionCtx = feature.context?.find((c) => c.id?.startsWith("region"));
        const state = toStateCode(
          regionCtx?.short_code?.replace("US-", "") || regionCtx?.text || "",
        );

        const city: GeocodedCity = {
          id: `geo:${feature.id ?? `${center[0]},${center[1]}`}`,
          name: feature.text || feature.place_name?.split(",")[0] || q,
          state,
          lng: center[0],
          lat: center[1],
          zoom: 11.5,
          metroRadiusKm: 40,
          placeName: feature.place_name ?? "",
          remote: true,
        };
        return city;
      })
      .filter((c): c is GeocodedCity => c !== null);
  } catch {
    return [];
  }
}
