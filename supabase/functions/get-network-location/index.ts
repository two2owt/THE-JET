import { corsHeaders, logVersion } from "../_shared/cors.ts";
import { getAuthenticatedUserId } from "../_shared/require-auth.ts";

const FUNCTION_NAME = "get-network-location";
logVersion(FUNCTION_NAME);

/**
 * Google Geolocation API proxy.
 * https://developers.google.com/maps/documentation/geolocation/overview
 *
 * Returns a coarse network (Wi-Fi / cell / IP) based fix so users whose device
 * GPS is unavailable, blocked or slow still contribute points to the heatmap
 * density and movement-path layers. The API key stays server-side.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) return json({ error: "Unauthorized" }, 401);

    const apiKey = Deno.env.get("GOOGLE_PLACES_API_KEY");
    if (!apiKey) return json({ location: null, error: "not_configured" });

    const body = await req.json().catch(() => ({} as Record<string, unknown>));

    // Only forward the fields Google accepts, and cap array sizes.
    const payload: Record<string, unknown> = { considerIp: true };
    if (Array.isArray(body.wifiAccessPoints) && body.wifiAccessPoints.length) {
      payload.wifiAccessPoints = body.wifiAccessPoints.slice(0, 20);
    }
    if (Array.isArray(body.cellTowers) && body.cellTowers.length) {
      payload.cellTowers = body.cellTowers.slice(0, 10);
    }

    const res = await fetch(
      `https://www.googleapis.com/geolocation/v1/geolocate?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      const reason = data?.error?.errors?.[0]?.reason ?? data?.error?.status ?? "unknown";
      console.error(`[${FUNCTION_NAME}] google error ${res.status}: ${reason}`);
      if (res.status === 403) {
        return json(
          {
            location: null,
            error: "permission_denied",
            details:
              "Enable the Geolocation API on the Google Cloud project and make sure the server key has no HTTP-referrer restriction.",
          },
          // 200 on purpose: this is an optional coarse-location fallback, so a
          // misconfigured key must degrade silently instead of surfacing a
          // runtime error in the client.
          200,
        );
      }
      if (res.status === 404) {
        return json({ location: null, error: "not_found" }, 200);
      }
      return json({ location: null, error: reason }, 200);
    }

    const lat = data?.location?.lat;
    const lng = data?.location?.lng;
    if (typeof lat !== "number" || typeof lng !== "number") {
      return json({ location: null, error: "no_fix" });
    }

    return json({
      location: { lat, lng },
      accuracy: typeof data?.accuracy === "number" ? data.accuracy : null,
      source: "network",
    });
  } catch (err) {
    console.error(`[${FUNCTION_NAME}] failure`, err);
    return json({ location: null, error: "internal_error" }, 500);
  }
});