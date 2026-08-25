import { corsHeaders, logVersion } from "../_shared/cors.ts";
import { internalError, invalidInput } from "../_shared/http.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const FUNCTION_NAME = "get-nearby-parking";
logVersion(FUNCTION_NAME);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Public POI lookup: an auth token is optional. Signed-out users still
    // get parking results (same policy as the venue search function).
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const authClient = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      );
      await authClient.auth
        .getClaims(authHeader.replace("Bearer ", ""))
        .catch(() => null);
    }


    const { lat, lng, radius = 500 } = await req.json().catch(() => ({}) as any);

    if (typeof lat !== "number" || typeof lng !== "number") {
      return invalidInput("lat and lng are required numbers");
    }

    const apiKey = Deno.env.get("GOOGLE_PLACES_API_KEY");

    if (!apiKey) {
      console.warn("GOOGLE_PLACES_API_KEY not set");
      return new Response(JSON.stringify({ results: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Haversine distance helper (meters)
    const distanceMeters = (
      la1: number,
      ln1: number,
      la2: number,
      ln2: number,
    ) => {
      const R = 6371000;
      const toRad = (d: number) => (d * Math.PI) / 180;
      const dLat = toRad(la2 - la1);
      const dLng = toRad(ln2 - ln1);
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(la1)) * Math.cos(toRad(la2)) * Math.sin(dLng / 2) ** 2;
      return 2 * R * Math.asin(Math.sqrt(a));
    };

    // Parking pricing. Google exposes a coarse price level (and sometimes an
    // explicit price range) for parking places; translate both into a short
    // label plus an estimated hourly band so the JetCard can show something
    // useful instead of nothing.
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
    const LEGACY_LEVELS = [
      "PRICE_LEVEL_FREE",
      "PRICE_LEVEL_INEXPENSIVE",
      "PRICE_LEVEL_MODERATE",
      "PRICE_LEVEL_EXPENSIVE",
      "PRICE_LEVEL_VERY_EXPENSIVE",
    ];

    const money = (units?: string | number | null, currency = "USD") => {
      const n = typeof units === "string" ? Number(units) : units;
      if (typeof n !== "number" || Number.isNaN(n)) return null;
      const symbol = currency === "USD" ? "$" : `${currency} `;
      return `${symbol}${Number.isInteger(n) ? n : n.toFixed(2)}`;
    };

    const pricing = (place: any) => {
      const level: string | null = place?.priceLevel ?? null;
      const range = place?.priceRange ?? null;
      const currency =
        range?.startPrice?.currencyCode ||
        range?.endPrice?.currencyCode ||
        "USD";
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
    };

    // Places API (New) — searchNearby. The legacy
    // maps.googleapis.com/maps/api/place/nearbysearch endpoint returns
    // REQUEST_DENIED for keys provisioned after Google retired it, which made
    // parking silently resolve to an empty list on every JetCard.
    const searchNearbyNew = async (radiusMeters: number) => {
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
                radius: radiusMeters,
              },
            },
          }),
        },
      );
      const json = await r.json();
      if (!r.ok) {
        console.warn(
          `searchNearby (new) ${r.status}: ${json?.error?.message ?? "unknown error"}`,
        );
        return null;
      }
      return Array.isArray(json.places) ? json.places : [];
    };

    // Legacy fallback, kept for projects whose key still has it enabled.
    const fetchPlaces = async (params: Record<string, string>) => {
      const url = new URL(
        "https://maps.googleapis.com/maps/api/place/nearbysearch/json",
      );
      Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v));
      url.searchParams.append("key", apiKey);
      const r = await fetch(url.toString());
      return r.json();
    };

    const clampedRadius = Math.min(Math.max(radius, 800), 3000);

    // 1. Preferred path: Places API (New).
    let normalized: any[] | null = null;
    const newPlaces = await searchNearbyNew(clampedRadius);
    if (newPlaces && newPlaces.length > 0) {
      normalized = newPlaces.map((p: any) => {
        const pLat = p.location?.latitude;
        const pLng = p.location?.longitude;
        return {
          name: p.displayName?.text || "Parking",
          address: p.shortFormattedAddress || p.formattedAddress || "",
          lat: pLat,
          lng: pLng,
          rating: p.rating ?? null,
          isOpen: p.currentOpeningHours?.openNow ?? null,
          placeId: p.id,
          ...pricing(p),
          distance:
            typeof pLat === "number" && typeof pLng === "number"
              ? Math.round(distanceMeters(lat, lng, pLat, pLng))
              : null,
        };
      });
    }

    // 2. Legacy fallback only when the new API returned nothing usable.
    if (!normalized || normalized.length === 0) {
      const searchData = await fetchPlaces({
        location: `${lat},${lng}`,
        radius: String(clampedRadius),
        keyword: "parking",
      });
      if (searchData.status !== "OK" || !searchData.results?.length) {
        console.warn(
          `No parking results for ${lat},${lng}: legacy status=${searchData.status}` +
            (searchData.error_message ? ` (${searchData.error_message})` : ""),
        );
        return new Response(JSON.stringify({ results: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      normalized = searchData.results.map((place: any) => {
        const pLat = place.geometry?.location?.lat;
        const pLng = place.geometry?.location?.lng;
        return {
          name: place.name || "Parking",
          address: place.vicinity || "",
          lat: pLat,
          lng: pLng,
          rating: place.rating || null,
          isOpen: place.opening_hours?.open_now ?? null,
          placeId: place.place_id,
          ...pricing({
            priceLevel:
              typeof place.price_level === "number"
                ? (LEGACY_LEVELS[place.price_level] ?? null)
                : null,
          }),
          distance:
            typeof pLat === "number" && typeof pLng === "number"
              ? Math.round(distanceMeters(lat, lng, pLat, pLng))
              : null,
        };
      });
    }

    // Return the 5 closest parking spots.
    const results = (normalized ?? [])
      .sort((a: any, b: any) => (a.distance ?? 9e9) - (b.distance ?? 9e9))
      .slice(0, 5);

    console.log(
      `Found ${results.length} parking lots near ${lat},${lng} (closest: ${results[0]?.distance}m)`,
    );

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in get-nearby-parking:", error);
    return internalError(error);
  }
});
