import { corsHeaders, logVersion } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const FUNCTION_NAME = "get-nearby-parking";
logVersion(FUNCTION_NAME);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(
      authHeader.replace("Bearer ", "")
    );
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { lat, lng, radius = 500 } = await req.json();

    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return new Response(
        JSON.stringify({ error: 'lat and lng are required numbers' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('GOOGLE_PLACES_API_KEY');

    if (!apiKey) {
      console.warn('GOOGLE_PLACES_API_KEY not set');
      return new Response(
        JSON.stringify({ results: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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

    // Places API (New) — searchNearby. The legacy
    // maps.googleapis.com/maps/api/place/nearbysearch endpoint returns
    // REQUEST_DENIED for keys provisioned after Google retired it, which made
    // parking silently resolve to an empty list on every JetCard.
    const searchNearbyNew = async (radiusMeters: number) => {
      const r = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': [
            'places.displayName',
            'places.formattedAddress',
            'places.shortFormattedAddress',
            'places.location',
            'places.rating',
            'places.currentOpeningHours.openNow',
            'places.id',
          ].join(','),
        },
        body: JSON.stringify({
          includedTypes: ['parking'],
          maxResultCount: 20,
          rankPreference: 'DISTANCE',
          locationRestriction: {
            circle: {
              center: { latitude: lat, longitude: lng },
              radius: radiusMeters,
            },
          },
        }),
      });
      const json = await r.json();
      if (!r.ok) {
        console.warn(`searchNearby (new) ${r.status}: ${json?.error?.message ?? 'unknown error'}`);
        return null;
      }
      return Array.isArray(json.places) ? json.places : [];
    };

    // Legacy fallback, kept for projects whose key still has it enabled.
    const fetchPlaces = async (params: Record<string, string>) => {
      const url = new URL('https://maps.googleapis.com/maps/api/place/nearbysearch/json');
      Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v));
      url.searchParams.append('key', apiKey);
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
          name: p.displayName?.text || 'Parking',
          address: p.shortFormattedAddress || p.formattedAddress || '',
          lat: pLat,
          lng: pLng,
          rating: p.rating ?? null,
          isOpen: p.currentOpeningHours?.openNow ?? null,
          placeId: p.id,
          distance:
            typeof pLat === 'number' && typeof pLng === 'number'
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
        keyword: 'parking',
      });
      if (searchData.status !== 'OK' || !searchData.results?.length) {
        console.warn(
          `No parking results for ${lat},${lng}: legacy status=${searchData.status}` +
            (searchData.error_message ? ` (${searchData.error_message})` : '')
        );
        return new Response(
          JSON.stringify({ results: [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      normalized = searchData.results.map((place: any) => {
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
      });
    }

    // Return the 5 closest parking spots.
    const results = normalized
      .sort((a: any, b: any) => (a.distance ?? 9e9) - (b.distance ?? 9e9))
      .slice(0, 5);

    console.log(`Found ${results.length} parking lots near ${lat},${lng} (closest: ${results[0]?.distance}m)`);

    return new Response(
      JSON.stringify({ results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in get-nearby-parking:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
