import { corsHeaders, logVersion } from "../_shared/cors.ts";

const FUNCTION_NAME = "get-mapbox-token";
logVersion(FUNCTION_NAME);

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const mapboxToken = Deno.env.get('MAPBOX_PUBLIC_TOKEN');
    
    if (!mapboxToken) {
      throw new Error('MAPBOX_PUBLIC_TOKEN not configured');
    }

    // Mapbox GL JS requires a public token (pk.*). Never expose secret tokens (sk.*) to clients.
    if (!mapboxToken.startsWith('pk.')) {
      throw new Error('MAPBOX_PUBLIC_TOKEN must be a public token starting with "pk."');
    }

    return new Response(
      JSON.stringify({ token: mapboxToken }),
      { 
        headers: { 
          ...corsHeaders,
          'Content-Type': 'application/json' 
        } 
      }
    );
  } catch (error) {
    console.error('Error fetching Mapbox token:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500,
        headers: { 
          ...corsHeaders,
          'Content-Type': 'application/json' 
        } 
      }
    );
  }
});
