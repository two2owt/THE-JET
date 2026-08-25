import {
  corsHeaders,
  logVersion,
  EDGE_FUNCTION_VERSION,
} from "../_shared/cors.ts";
import { internalError, invalidInput } from "../_shared/http.ts";
import { getAuthenticatedUserId } from "../_shared/require-auth.ts";

const FUNCTION_NAME = "get-parking-details";
logVersion(FUNCTION_NAME);

// Coarse Google price level -> short label + estimated hourly band, so the
// parking card can show a rate instead of nothing.
const PRICE_BANDS: Array<{ label: string; detail: string }> = [
  { label: "Free", detail: "No charge" },
  { label: "$", detail: "~$1–$3/hr est." },
  { label: "$$", detail: "~$3–$7/hr est." },
  { label: "$$$", detail: "~$7–$15/hr est." },
  { label: "$$$$", detail: "~$15–$30/hr est." },
];

const pricing = (level: number | null | undefined) => {
  if (typeof level !== "number" || !PRICE_BANDS[level]) {
    return { priceLabel: null, priceDetail: null };
  }
  return {
    priceLabel: PRICE_BANDS[level].label,
    priceDetail: PRICE_BANDS[level].detail,
  };
};

// Simple in-memory per-caller rate limit (30 requests / minute) so a signed-in
// account cannot burn through the paid Google Places quota.
const RATE_LIMIT = 30;
const WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();

function rateLimitOk(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  return recent.length <= RATE_LIMIT;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return new Response(
      JSON.stringify({ error: "unauthorized", message: "Sign in required" }),
      {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  if (!rateLimitOk(userId)) {
    return new Response(
      JSON.stringify({ error: "rate_limited", message: "Too many requests" }),
      {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  try {
    const { lat, lng, name } = await req.json().catch(() => ({}) as any);

    if (typeof lat !== "number" || typeof lng !== "number") {
      return invalidInput("lat and lng are required numbers");
    }

    const apiKey = googleKeys()[0];

    if (!apiKey) {
      // No Google key configured at all — fall back to the alternate
      // provider chain (Mapbox, then OpenStreetMap) so the card still
      // resolves a real nearby lot instead of showing "unavailable".
      const { results, provider } = await findNearbyParking(lat, lng, 300);
      const best = results[0];
      return new Response(
        JSON.stringify({
          name: best?.name || name || "Parking Lot",
          address: best?.address || "Address unavailable",
          lat: best?.lat ?? lat,
          lng: best?.lng ?? lng,
          rating: best?.rating ?? null,
          totalRatings: 0,
          isOpen: best?.isOpen ?? null,
          openingHours: [],
          priceLevel: null,
          priceLabel: best?.priceLabel ?? null,
          priceDetail: best?.priceDetail ?? null,
          placeId: best?.placeId ?? null,
          provider,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }


    // Use Nearby Search to find the parking lot
    const searchQuery = name ? `${name} parking` : "parking";
    const searchUrl = new URL(
      "https://maps.googleapis.com/maps/api/place/nearbysearch/json",
    );
    searchUrl.searchParams.append("location", `${lat},${lng}`);
    searchUrl.searchParams.append("radius", "100");
    searchUrl.searchParams.append("type", "parking");
    searchUrl.searchParams.append("keyword", searchQuery);
    searchUrl.searchParams.append("key", apiKey);

    const searchResponse = await fetch(searchUrl.toString());
    const searchData = await searchResponse.json();

    if (searchData.status !== "OK" || !searchData.results?.length) {
      // Try broader search without keyword
      const broadUrl = new URL(
        "https://maps.googleapis.com/maps/api/place/nearbysearch/json",
      );
      broadUrl.searchParams.append("location", `${lat},${lng}`);
      broadUrl.searchParams.append("radius", "200");
      broadUrl.searchParams.append("type", "parking");
      broadUrl.searchParams.append("key", apiKey);

      const broadResponse = await fetch(broadUrl.toString());
      const broadData = await broadResponse.json();

      if (broadData.status !== "OK" || !broadData.results?.length) {
        return new Response(
          JSON.stringify({
            name: name || "Parking",
            address: "Address unavailable",
            lat,
            lng,
            rating: null,
            totalRatings: 0,
            isOpen: null,
            openingHours: [],
            priceLevel: null,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      searchData.results = broadData.results;
    }

    const place = searchData.results[0];

    // Get place details
    const detailsUrl = new URL(
      "https://maps.googleapis.com/maps/api/place/details/json",
    );
    detailsUrl.searchParams.append("place_id", place.place_id);
    detailsUrl.searchParams.append(
      "fields",
      "formatted_address,formatted_phone_number,website,opening_hours,rating,user_ratings_total,price_level,name",
    );
    detailsUrl.searchParams.append("key", apiKey);

    const detailsResponse = await fetch(detailsUrl.toString());
    const detailsData = await detailsResponse.json();
    const details = detailsData.result || {};

    const result = {
      name: details.name || place.name || name || "Parking",
      address:
        details.formatted_address || place.vicinity || "Address unavailable",
      lat: place.geometry?.location?.lat || lat,
      lng: place.geometry?.location?.lng || lng,
      rating: details.rating || place.rating || null,
      totalRatings: details.user_ratings_total || place.user_ratings_total || 0,
      isOpen: place.opening_hours?.open_now ?? null,
      openingHours: details.opening_hours?.weekday_text || [],
      priceLevel: details.price_level ?? place.price_level ?? null,
      ...pricing(details.price_level ?? place.price_level ?? null),
      phone: details.formatted_phone_number || null,
      website: details.website || null,
      placeId: place.place_id,
    };

    console.log(`Parking details fetched: ${result.name} at ${result.address}`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in get-parking-details:", error);
    return internalError(error);
  }
});
