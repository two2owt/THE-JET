import { corsHeaders, logVersion } from "../_shared/cors.ts";
import { internalError, invalidInput } from "../_shared/http.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { findNearbyParking } from "../_shared/places-provider.ts";

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

    const { lat, lng, radius = 500 } = await req
      .json()
      .catch(() => ({}) as any);

    if (typeof lat !== "number" || typeof lng !== "number") {
      return invalidInput("lat and lng are required numbers");
    }

    const clampedRadius = Math.min(Math.max(radius, 800), 3000);

    // Provider chain: every configured Google key, then Mapbox, then OSM.
    const { results, provider } = await findNearbyParking(
      lat,
      lng,
      clampedRadius,
    );

    console.log(
      `Found ${results.length} parking lots near ${lat},${lng} via ${provider}` +
        (results[0]?.distance != null
          ? ` (closest: ${results[0].distance}m)`
          : ""),
    );

    return new Response(JSON.stringify({ results, provider }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in get-nearby-parking:", error);
    return internalError(error);
  }
});
