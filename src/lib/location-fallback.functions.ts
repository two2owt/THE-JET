import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** A fix older than this makes the user "stale" for heatmap purposes. */
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
/** Coarse network fixes are capped so we never store junk-precision points. */
const MAX_COARSE_ACCURACY_METERS = 25_000;

/** Edge/CDN geo headers, used when the client can't produce any fix at all. */
function edgeGeoFromHeaders(): {
  lat: number;
  lng: number;
  accuracy: number;
} | null {
  const request = getRequest();
  const h = request?.headers;
  if (!h) return null;
  const lat = Number(h.get("cf-iplatitude") ?? h.get("x-vercel-ip-latitude"));
  const lng = Number(h.get("cf-iplongitude") ?? h.get("x-vercel-ip-longitude"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  // City-level IP geolocation — flag it as very coarse.
  return { lat, lng, accuracy: 20_000 };
}

async function lastFixAt(
  supabase: { from: (t: string) => any },
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("user_locations")
    .select("created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.created_at as string | undefined) ?? null;
}

/**
 * Reports whether the caller has any location row in the last 24h, so the app
 * can decide on open whether a coarse fallback write is needed.
 */
export const getLocationFreshness = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const at = await lastFixAt(context.supabase as never, context.userId);
    const ageMs = at ? Date.now() - new Date(at).getTime() : null;
    return {
      lastFixAt: at,
      ageMs,
      stale: ageMs === null || ageMs > STALE_AFTER_MS,
      staleAfterMs: STALE_AFTER_MS,
    };
  });

/**
 * Writes a single coarse fallback fix, but only when the caller really has no
 * fix in the last 24h (re-checked server-side so a racing client can't spam
 * rows). If the client couldn't resolve any coordinates, falls back to the
 * edge's IP-derived city-level location.
 */
export const writeCoarseLocationFallback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        lat: z.number().min(-90).max(90).nullable().optional(),
        lng: z.number().min(-180).max(180).nullable().optional(),
        accuracy: z.number().positive().nullable().optional(),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const at = await lastFixAt(context.supabase as never, context.userId);
    if (at && Date.now() - new Date(at).getTime() <= STALE_AFTER_MS) {
      return { written: false as const, reason: "recent fix already exists" };
    }

    let fix =
      typeof data.lat === "number" && typeof data.lng === "number"
        ? {
            lat: data.lat,
            lng: data.lng,
            accuracy: data.accuracy ?? MAX_COARSE_ACCURACY_METERS,
          }
        : null;
    let source: "client-network" | "edge-ip" = "client-network";

    if (!fix) {
      fix = edgeGeoFromHeaders();
      source = "edge-ip";
    }
    if (!fix) return { written: false as const, reason: "no coarse fix available" };
    if (fix.accuracy > MAX_COARSE_ACCURACY_METERS) {
      return { written: false as const, reason: "fix too coarse" };
    }

    const { error } = await context.supabase.from("user_locations").insert({
      user_id: context.userId,
      latitude: fix.lat,
      longitude: fix.lng,
      accuracy: Math.round(fix.accuracy),
    });
    if (error) return { written: false as const, reason: error.message };

    return { written: true as const, source, accuracy: Math.round(fix.accuracy) };
  });
