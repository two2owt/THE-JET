import { corsHeaders, logVersion } from "../_shared/cors.ts";
import { getAuthenticatedUserId } from "../_shared/require-auth.ts";

const FUNCTION_NAME = "get-venue-photo";
logVersion(FUNCTION_NAME);

// Google photo URIs are short-lived signed URLs; cache per instance for 30 min.
const CACHE_TTL_MS = 30 * 60 * 1000;
const cache = new Map<
  string,
  { url: string | null; attribution: string | null; expires: number }
>();

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

    const body = await req.json().catch(() => ({}));
    const name =
      typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
    const address =
      typeof body.address === "string" ? body.address.trim().slice(0, 200) : "";
    const placeId =
      typeof body.placeId === "string" ? body.placeId.trim().slice(0, 200) : "";
    const lat = typeof body.lat === "number" ? body.lat : null;
    const lng = typeof body.lng === "number" ? body.lng : null;
    const maxWidth = Math.min(
      Math.max(Number(body.maxWidth) || 800, 200),
      1600,
    );

    if (!name && !placeId)
      return json({ error: "name or placeId is required" }, 400);

    const apiKey = Deno.env.get("GOOGLE_PLACES_API_KEY");
    if (!apiKey) return json({ photoUrl: null, error: "not_configured" });

    const cacheKey = `${placeId || name}|${address}|${maxWidth}`;
    const hit = cache.get(cacheKey);
    if (hit && hit.expires > Date.now()) {
      return json({
        photoUrl: hit.url,
        attribution: hit.attribution,
        cached: true,
      });
    }

    // 1. Resolve the place's photo resource name.
    let photoName: string | null = null;
    let attribution: string | null = null;

    if (placeId) {
      const res = await fetch(
        `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
        { headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "photos" } },
      );
      if (res.ok) {
        const data = await res.json();
        photoName = data.photos?.[0]?.name ?? null;
        attribution =
          data.photos?.[0]?.authorAttributions?.[0]?.displayName ?? null;
      }
    }

    if (!photoName && name) {
      const searchBody: Record<string, unknown> = {
        textQuery: address ? `${name}, ${address}` : name,
        maxResultCount: 1,
      };
      if (lat !== null && lng !== null) {
        searchBody.locationBias = {
          circle: { center: { latitude: lat, longitude: lng }, radius: 2000 },
        };
      }
      const res = await fetch(
        "https://places.googleapis.com/v1/places:searchText",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask": "places.id,places.photos",
          },
          body: JSON.stringify(searchBody),
        },
      );
      if (res.ok) {
        const data = await res.json();
        const place = data.places?.[0];
        photoName = place?.photos?.[0]?.name ?? null;
        attribution =
          place?.photos?.[0]?.authorAttributions?.[0]?.displayName ?? null;
      } else {
        console.error("Places searchText error", res.status, await res.text());
      }
    }

    if (!photoName) {
      cache.set(cacheKey, {
        url: null,
        attribution: null,
        expires: Date.now() + CACHE_TTL_MS,
      });
      return json({ photoUrl: null });
    }

    // 2. Resolve the signed media URI (never expose the API key to the client).
    const mediaRes = await fetch(
      `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${maxWidth}&skipHttpRedirect=true`,
      { headers: { "X-Goog-Api-Key": apiKey } },
    );
    if (!mediaRes.ok) {
      console.error(
        "Places photo media error",
        mediaRes.status,
        await mediaRes.text(),
      );
      return json({ photoUrl: null });
    }
    const media = await mediaRes.json();
    const photoUrl: string | null = media.photoUri ?? null;

    cache.set(cacheKey, {
      url: photoUrl,
      attribution,
      expires: Date.now() + CACHE_TTL_MS,
    });
    return json({ photoUrl, attribution });
  } catch (error) {
    console.error(`[${FUNCTION_NAME}]`, error);
    return json({ photoUrl: null, error: "internal_error" });
  }
});
