import { corsHeaders, logVersion } from "../_shared/cors.ts";

const FUNCTION_NAME = "get-nearby-parking";
logVersion(FUNCTION_NAME);

// Structured logger — one JSON line per event so log search stays useful.
// Never accepts secrets (api key, tokens); callers pass only diagnostic fields.
const log = (
  level: "info" | "warn" | "error",
  event: string,
  fields: Record<string, unknown> = {},
) => {
  const line = JSON.stringify({
    fn: FUNCTION_NAME,
    level,
    event,
    ts: new Date().toISOString(),
    ...fields,
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
};

Deno.serve(async (req) => {
  const requestId = req.headers.get("sb-request-id") ?? crypto.randomUUID();
  const isAuthed = (req.headers.get("Authorization") ?? "").startsWith("Bearer ");

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      log("warn", "invalid_json_body", { requestId, isAuthed });
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const { lat, lng, radius = 500 } = (body ?? {}) as {
      lat?: unknown; lng?: unknown; radius?: number;
    };

    if (typeof lat !== 'number' || typeof lng !== 'number') {
      log("warn", "invalid_params", {
        requestId,
        isAuthed,
        latType: typeof lat,
        lngType: typeof lng,
        latPresent: lat !== undefined,
        lngPresent: lng !== undefined,
      });
      return new Response(
        JSON.stringify({ error: 'lat and lng are required numbers' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('GOOGLE_PLACES_API_KEY');

    if (!apiKey) {
      log("error", "missing_google_places_key", { requestId, isAuthed });
      return new Response(
        JSON.stringify({ results: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    log("info", "request_received", { requestId, isAuthed, lat, lng, radius });

    // Haversine distance helper (meters)
    const distanceMeters = (la1: number, ln1: number, la2: number, ln2: number) => {
      const R = 6371000;
      const toRad = (d: number) => (d * Math.PI) / 180;
      const dLat = toRad(la2 - la1);
      const dLng = toRad(ln2 - ln1);
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(la1)) * Math.cos(toRad(la2)) * Math.sin(dLng / 2) ** 2;
      return 2 * R * Math.asin(Math.sqrt(a));
    };

    // Use rankby=distance for true nearest-first ordering (returns up to 20).
    // Falls back to a radius search if the first call yields nothing.
    const fetchPlaces = async (params: Record<string, string>) => {
      const url = new URL('https://maps.googleapis.com/maps/api/place/nearbysearch/json');
      Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v));
      url.searchParams.append('key', apiKey);
      const r = await fetch(url.toString());
      return r.json();
    };

    let searchData = await fetchPlaces({
      location: `${lat},${lng}`,
      rankby: 'distance',
      type: 'parking',
    });

    if (searchData.status !== 'OK' || !searchData.results?.length) {
      log("warn", "google_places_fallback", {
        requestId,
        strategy: "rankby_distance",
        upstreamStatus: searchData.status,
        upstreamError: searchData.error_message,
      });
      searchData = await fetchPlaces({
        location: `${lat},${lng}`,
        radius: String(Math.min(Math.max(radius, 1500), 3000)),
        keyword: 'parking',
      });
    }

    if (searchData.status !== 'OK' || !searchData.results?.length) {
      log("warn", "google_places_empty", {
        requestId,
        lat,
        lng,
        upstreamStatus: searchData.status,
        upstreamError: searchData.error_message,
      });
      return new Response(
        JSON.stringify({ results: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Compute distance and return the 5 closest parking spots.
    const results = searchData.results
      .map((place: any) => {
        const pLat = place.geometry?.location?.lat;
        const pLng = place.geometry?.location?.lng;
        return {
          name: place.name || 'Parking',
          address: place.vicinity || '',
          lat: pLat,
          lng: pLng,
          rating: place.rating || null,
          isOpen: place.opening_hours?.open_now ?? null,
          placeId: place.place_id,
          distance:
            typeof pLat === 'number' && typeof pLng === 'number'
              ? Math.round(distanceMeters(lat, lng, pLat, pLng))
              : null,
        };
      })
      .sort((a: any, b: any) => (a.distance ?? 9e9) - (b.distance ?? 9e9))
      .slice(0, 5);

    log("info", "results_returned", {
      requestId,
      count: results.length,
      closestMeters: results[0]?.distance ?? null,
    });

    return new Response(
      JSON.stringify({ results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    log("error", "unhandled_exception", {
      requestId,
      isAuthed,
      message: error instanceof Error ? error.message : String(error),
    });
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
