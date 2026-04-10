import { corsHeaders, logVersion, EDGE_FUNCTION_VERSION } from "../_shared/cors.ts";

const FUNCTION_NAME = "get-parking-details";
logVersion(FUNCTION_NAME);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { lat, lng, name } = await req.json();

    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return new Response(
        JSON.stringify({ error: 'lat and lng are required numbers' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('GOOGLE_PLACES_API_KEY');

    if (!apiKey) {
      console.warn('GOOGLE_PLACES_API_KEY not set, returning minimal data');
      return new Response(
        JSON.stringify({
          name: name || 'Parking Lot',
          address: 'Address unavailable',
          lat,
          lng,
          rating: null,
          totalRatings: 0,
          isOpen: null,
          openingHours: [],
          priceLevel: null,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use Nearby Search to find the parking lot
    const searchQuery = name ? `${name} parking` : 'parking';
    const searchUrl = new URL('https://maps.googleapis.com/maps/api/place/nearbysearch/json');
    searchUrl.searchParams.append('location', `${lat},${lng}`);
    searchUrl.searchParams.append('radius', '100');
    searchUrl.searchParams.append('type', 'parking');
    searchUrl.searchParams.append('keyword', searchQuery);
    searchUrl.searchParams.append('key', apiKey);

    const searchResponse = await fetch(searchUrl.toString());
    const searchData = await searchResponse.json();

    if (searchData.status !== 'OK' || !searchData.results?.length) {
      // Try broader search without keyword
      const broadUrl = new URL('https://maps.googleapis.com/maps/api/place/nearbysearch/json');
      broadUrl.searchParams.append('location', `${lat},${lng}`);
      broadUrl.searchParams.append('radius', '200');
      broadUrl.searchParams.append('type', 'parking');
      broadUrl.searchParams.append('key', apiKey);

      const broadResponse = await fetch(broadUrl.toString());
      const broadData = await broadResponse.json();

      if (broadData.status !== 'OK' || !broadData.results?.length) {
        return new Response(
          JSON.stringify({
            name: name || 'Parking',
            address: 'Address unavailable',
            lat,
            lng,
            rating: null,
            totalRatings: 0,
            isOpen: null,
            openingHours: [],
            priceLevel: null,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      searchData.results = broadData.results;
    }

    const place = searchData.results[0];

    // Get place details
    const detailsUrl = new URL('https://maps.googleapis.com/maps/api/place/details/json');
    detailsUrl.searchParams.append('place_id', place.place_id);
    detailsUrl.searchParams.append('fields', 'formatted_address,formatted_phone_number,website,opening_hours,rating,user_ratings_total,price_level,name');
    detailsUrl.searchParams.append('key', apiKey);

    const detailsResponse = await fetch(detailsUrl.toString());
    const detailsData = await detailsResponse.json();
    const details = detailsData.result || {};

    const result = {
      name: details.name || place.name || name || 'Parking',
      address: details.formatted_address || place.vicinity || 'Address unavailable',
      lat: place.geometry?.location?.lat || lat,
      lng: place.geometry?.location?.lng || lng,
      rating: details.rating || place.rating || null,
      totalRatings: details.user_ratings_total || place.user_ratings_total || 0,
      isOpen: place.opening_hours?.open_now ?? null,
      openingHours: details.opening_hours?.weekday_text || [],
      priceLevel: details.price_level ?? place.price_level ?? null,
      phone: details.formatted_phone_number || null,
      website: details.website || null,
      placeId: place.place_id,
    };

    console.log(`Parking details fetched: ${result.name} at ${result.address}`);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in get-parking-details:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
