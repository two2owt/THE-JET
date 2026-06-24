import { corsHeaders, logVersion, EDGE_FUNCTION_VERSION } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const FUNCTION_NAME = "get-google-places-data";
logVersion(FUNCTION_NAME);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Require an authenticated caller — prevents anonymous quota abuse.
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
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { placeId, fields = ['rating', 'user_ratings_total', 'reviews', 'opening_hours', 'current_opening_hours'] } = body;
    
    // Validate placeId - must be a non-empty string with max length
    if (!placeId || typeof placeId !== 'string') {
      return new Response(
        JSON.stringify({ error: 'placeId is required and must be a string' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Validate placeId format and length (Google Place IDs are typically 27-50 chars)
    if (placeId.length < 10 || placeId.length > 200) {
      return new Response(
        JSON.stringify({ error: 'Invalid placeId format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Validate fields array
    const allowedFields = ['rating', 'user_ratings_total', 'reviews', 'opening_hours', 'current_opening_hours', 'formatted_address', 'formatted_phone_number', 'website', 'geometry'];
    const validatedFields = Array.isArray(fields) 
      ? fields.filter(f => typeof f === 'string' && allowedFields.includes(f))
      : ['rating', 'user_ratings_total', 'reviews', 'opening_hours', 'current_opening_hours'];

    const apiKey = Deno.env.get('GOOGLE_PLACES_API_KEY');
    if (!apiKey) {
      throw new Error('GOOGLE_PLACES_API_KEY not configured');
    }

    console.log(`Fetching Google Places data for place ID: ${placeId}`);

    // Use Google Places API (New) - Place Details
    const fieldsParam = validatedFields.join(',');
    const encodedPlaceId = encodeURIComponent(placeId);
    const url = `https://places.googleapis.com/v1/places/${encodedPlaceId}?fields=${fieldsParam}&key=${apiKey}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Google Places API error:', response.status, errorText);
      throw new Error(`Google Places API error: ${response.status}`);
    }

    const data = await response.json();
    
    console.log(`Successfully fetched data for place ${placeId}`);

    // Extract and format the data
    const formattedData = {
      rating: data.rating || null,
      totalRatings: data.userRatingsTotal || 0,
      reviews: data.reviews?.slice(0, 5).map((review: any) => ({
        author: review.authorAttribution?.displayName || 'Anonymous',
        rating: review.rating || 0,
        text: review.text?.text || '',
        time: review.publishTime || null,
      })) || [],
      isOpen: data.currentOpeningHours?.openNow || null,
      openingHours: data.openingHours?.weekdayDescriptions || [],
    };

    return new Response(
      JSON.stringify(formattedData),
      { 
        headers: { 
          ...corsHeaders,
          'Content-Type': 'application/json' 
        } 
      }
    );
  } catch (error) {
    console.error('Error in get-google-places-data function:', error);
    
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        rating: null,
        totalRatings: 0,
        reviews: [],
        isOpen: null,
        openingHours: []
      }),
      { 
        status: 200, // Return 200 with empty data to allow graceful fallback
        headers: { 
          ...corsHeaders,
          'Content-Type': 'application/json' 
        } 
      }
    );
  }
});
