import { corsHeaders, logVersion } from "../_shared/cors.ts";

const FUNCTION_NAME = "get-nearby-parking";
logVersion(FUNCTION_NAME);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
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
      console.warn(`rankby=distance returned ${searchData.status}; retrying with radius`);
      searchData = await fetchPlaces({
        location: `${lat},${lng}`,
        radius: String(Math.min(Math.max(radius, 1500), 3000)),
        keyword: 'parking',
      });
    }

    if (searchData.status !== 'OK' || !searchData.results?.length) {
      console.warn(`No parking results for ${lat},${lng}: ${searchData.status}`);
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
