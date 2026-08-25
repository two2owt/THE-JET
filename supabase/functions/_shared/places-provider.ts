/**
 * Multi-provider places lookup with key rotation.
 *
 * Order of attempts:
 *   1. Google Places (New) — every configured key, in order. Keys that are
 *      suspended / denied / over quota are skipped and the next key is tried.
 *   2. Mapbox Search Box category search (MAPBOX_SECRET_TOKEN or
 *      MAPBOX_PUBLIC_TOKEN) — we already ship Mapbox for the map.
 *   3. OpenStreetMap Overpass — keyless last resort so parking never goes
 *      fully dark when every commercial key is unavailable.
 *
 * Configure extra Google keys with any of:
 *   GOOGLE_PLACES_API_KEY, GOOGLE_PLACES_API_KEY_2, GOOGLE_PLACES_API_KEY_3,
 *   GOOGLE_PLACES_API_KEY_BACKUP
 */

export type PlaceResult = {
  name: string;
  address: string;
  lat: number;
  lng: number;
  rating: number | null;
  isOpen: boolean | null;
  placeId: string | null;
  priceLevel?: string | null;
  priceLabel?: string | null;
  priceDetail?: string | null;
  distance: number | null;
};

export function googleKeys(): string[] {
  return [
    Deno.env.get("GOOGLE_PLACES_API_KEY"),
    Deno.env.get("GOOGLE_PLACES_API_KEY_2"),
    Deno.env.get("GOOGLE_PLACES_API_KEY_3"),
    Deno.env.get("GOOGLE_PLACES_API_KEY_BACKUP"),
  ].filter((k): k is string => typeof k === "string" && k.trim().length > 0);
}

function mapboxToken(): string | null {
  return (
    Deno.env.get("MAPBOX_SECRET_TOKEN") ||
    Deno.env.get("MAPBOX_PUBLIC_TOKEN") ||
    null
  );
}

export function distanceMeters(
  la1: number,
  ln1: number,
  la2: number,
  ln2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(la2 - la1);
  const dLng = toRad(ln2 - ln1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(la1)) * Math.cos(toRad(la2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const PRICE_LEVEL_BANDS: Record<
  string,
  { label: string; from: number; to: number }
> = {
  PRICE_LEVEL_FREE: { label: "Free", from: 0, to: 0 },
  PRICE_LEVEL_INEXPENSIVE: { label: "$", from: 1, to: 3 },
  PRICE_LEVEL_MODERATE: { label: "$$", from: 3, to: 7 },
  PRICE_LEVEL_EXPENSIVE: { label: "$$$", from: 7, to: 15 },
  PRICE_LEVEL_VERY_EXPENSIVE: { label: "$$$$", from: 15, to: 30 },
};

export function pricingFromPlace(place: any) {
  const money = (units?: string | number | null, currency = "USD") => {
    const n = typeof units === "string" ? Number(units) : units;
    if (typeof n !== "number" || Number.isNaN(n)) return null;
    const symbol = currency === "USD" ? "$" : `${currency} `;
    return `${symbol}${Number.isInteger(n) ? n : n.toFixed(2)}`;
  };
  const level: string | null = place?.priceLevel ?? null;
  const range = place?.priceRange ?? null;
  const currency =
    range?.startPrice?.currencyCode || range?.endPrice?.currencyCode || "USD";
  const start = money(range?.startPrice?.units, currency);
  const end = money(range?.endPrice?.units, currency);

  let priceLabel: string | null = null;
  let priceDetail: string | null = null;
  if (start && end && start !== end) {
    priceLabel = `${start}–${end}`;
    priceDetail = "Typical rate";
  } else if (start || end) {
    priceLabel = (start ?? end) as string;
    priceDetail = "Typical rate";
  } else if (level && PRICE_LEVEL_BANDS[level]) {
    const band = PRICE_LEVEL_BANDS[level];
    priceLabel = band.label;
    priceDetail =
      band.to === 0 ? "No charge" : `~$${band.from}–$${band.to}/hr est.`;
  }
  return { priceLevel: level, priceLabel, priceDetail };
}

/**
 * Run a Google Places request against every configured key until one works.
 * `run(key)` should return parsed data, or throw / return null on failure.
 */
export async function withGoogleKeyRotation<T>(
  label: string,
  run: (key: string) => Promise<T | null>,
): Promise<T | null> {
  const keys = googleKeys();
  for (let i = 0; i < keys.length; i++) {
    try {
      const out = await run(keys[i]);
      if (out !== null && out !== undefined) return out;
      console.warn(`[${label}] google key #${i + 1} returned no usable data`);
    } catch (err) {
      console.warn(`[${label}] google key #${i + 1} failed: ${err}`);
    }
  }
  return null;
}

async function googleParking(
  lat: number,
  lng: number,
  radius: number,
): Promise<PlaceResult[] | null> {
  return await withGoogleKeyRotation<PlaceResult[]>(
    "parking",
    async (apiKey) => {
      const r = await fetch(
        "https://places.googleapis.com/v1/places:searchNearby",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask": [
              "places.displayName",
              "places.formattedAddress",
              "places.shortFormattedAddress",
              "places.location",
              "places.rating",
              "places.currentOpeningHours.openNow",
              "places.priceLevel",
              "places.priceRange",
              "places.id",
            ].join(","),
          },
          body: JSON.stringify({
            includedTypes: ["parking"],
            maxResultCount: 20,
            rankPreference: "DISTANCE",
            locationRestriction: {
              circle: {
                center: { latitude: lat, longitude: lng },
                radius,
              },
            },
          }),
        },
      );
      const json = await r.json().catch(() => null);
      if (!r.ok) {
        throw new Error(
          `${r.status} ${json?.error?.status ?? ""} ${json?.error?.message ?? ""}`.trim(),
        );
      }
      const places = Array.isArray(json?.places) ? json.places : [];
      if (places.length === 0) return null;
      return places.map((p: any) => {
        const pLat = p.location?.latitude;
        const pLng = p.location?.longitude;
        return {
          name: p.displayName?.text || "Parking",
          address: p.shortFormattedAddress || p.formattedAddress || "",
          lat: pLat,
          lng: pLng,
          rating: p.rating ?? null,
          isOpen: p.currentOpeningHours?.openNow ?? null,
          placeId: p.id ?? null,
          ...pricingFromPlace(p),
          distance:
            typeof pLat === "number" && typeof pLng === "number"
              ? Math.round(distanceMeters(lat, lng, pLat, pLng))
              : null,
        } as PlaceResult;
      });
    },
  );
}

async function mapboxParking(
  lat: number,
  lng: number,
  radius: number,
): Promise<PlaceResult[] | null> {
  const token = mapboxToken();
  if (!token) return null;
  try {
    const url = new URL(
      "https://api.mapbox.com/search/searchbox/v1/category/parking",
    );
    url.searchParams.set("access_token", token);
    url.searchParams.set("proximity", `${lng},${lat}`);
    url.searchParams.set("limit", "20");
    url.searchParams.set("language", "en");
    const r = await fetch(url.toString());
    const json = await r.json().catch(() => null);
    if (!r.ok || !Array.isArray(json?.features)) {
      console.warn(`[parking] mapbox fallback failed: ${r.status}`);
      return null;
    }
    const results = json.features
      .map((f: any) => {
        const [fLng, fLat] = f.geometry?.coordinates ?? [];
        if (typeof fLat !== "number" || typeof fLng !== "number") return null;
        return {
          name: f.properties?.name || "Parking",
          address:
            f.properties?.address ||
            f.properties?.full_address ||
            f.properties?.place_formatted ||
            "",
          lat: fLat,
          lng: fLng,
          rating: null,
          isOpen: null,
          placeId: f.properties?.mapbox_id ?? null,
          priceLevel: null,
          priceLabel: null,
          priceDetail: null,
          distance: Math.round(distanceMeters(lat, lng, fLat, fLng)),
        } as PlaceResult;
      })
      .filter(Boolean)
      .filter((p: PlaceResult) => (p.distance ?? 0) <= radius * 2);
    return results.length ? results : null;
  } catch (err) {
    console.warn(`[parking] mapbox fallback error: ${err}`);
    return null;
  }
}

async function overpassParking(
  lat: number,
  lng: number,
  radius: number,
): Promise<PlaceResult[] | null> {
  try {
    const query = `[out:json][timeout:10];(node["amenity"="parking"](around:${Math.round(radius)},${lat},${lng});way["amenity"="parking"](around:${Math.round(radius)},${lat},${lng}););out center 20;`;
    const r = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
    });
    if (!r.ok) return null;
    const json = await r.json().catch(() => null);
    const elements = Array.isArray(json?.elements) ? json.elements : [];
    const results = elements
      .map((el: any) => {
        const eLat = el.lat ?? el.center?.lat;
        const eLng = el.lon ?? el.center?.lon;
        if (typeof eLat !== "number" || typeof eLng !== "number") return null;
        const fee = el.tags?.fee;
        return {
          name: el.tags?.name || "Parking",
          address: el.tags?.["addr:street"] ?? "",
          lat: eLat,
          lng: eLng,
          rating: null,
          isOpen: null,
          placeId: el.id ? `osm:${el.type}:${el.id}` : null,
          priceLevel: null,
          priceLabel: fee === "no" ? "Free" : null,
          priceDetail: fee === "no" ? "No charge" : null,
          distance: Math.round(distanceMeters(lat, lng, eLat, eLng)),
        } as PlaceResult;
      })
      .filter(Boolean);
    return results.length ? results : null;
  } catch (err) {
    console.warn(`[parking] overpass fallback error: ${err}`);
    return null;
  }
}

/** Nearby parking across all configured providers. */
export async function findNearbyParking(
  lat: number,
  lng: number,
  radius: number,
): Promise<{ results: PlaceResult[]; provider: string }> {
  const attempts: Array<[string, () => Promise<PlaceResult[] | null>]> = [
    ["google_places", () => googleParking(lat, lng, radius)],
    ["mapbox", () => mapboxParking(lat, lng, radius)],
    ["openstreetmap", () => overpassParking(lat, lng, radius)],
  ];

  for (const [provider, run] of attempts) {
    const results = await run();
    if (results && results.length) {
      return {
        results: results
          .sort((a, b) => (a.distance ?? 9e9) - (b.distance ?? 9e9))
          .slice(0, 5),
        provider,
      };
    }
  }
  return { results: [], provider: "none" };
}
