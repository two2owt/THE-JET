import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Reports whether the caller has any location row in the last 24h, so the app
 * can decide on open whether a coarse fallback write is needed.
 */
export const getLocationFreshness = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { lastFixAt, STALE_AFTER_MS } = await import(
      "@/lib/location-fallback.server"
    );
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
  .validator((data) =>
    z
      .object({
        lat: z.number().min(-90).max(90).nullable().optional(),
        lng: z.number().min(-180).max(180).nullable().optional(),
        accuracy: z.number().positive().nullable().optional(),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const {
      lastFixAt,
      isStale,
      edgeGeoFromHeaders,
      MAX_COARSE_ACCURACY_METERS,
    } = await import("@/lib/location-fallback.server");

    const at = await lastFixAt(context.supabase as never, context.userId);
    if (!isStale(at)) {
      return { written: false as const, reason: "recent fix already exists" };
    }

    let source: "client-network" | "edge-ip" = "client-network";
    let fix =
      typeof data.lat === "number" && typeof data.lng === "number"
        ? {
            lat: data.lat,
            lng: data.lng,
            accuracy: data.accuracy ?? MAX_COARSE_ACCURACY_METERS,
          }
        : null;

    if (!fix) {
      fix = edgeGeoFromHeaders();
      source = "edge-ip";
    }
    if (!fix) {
      return { written: false as const, reason: "no coarse fix available" };
    }
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

    return {
      written: true as const,
      source,
      accuracy: Math.round(fix.accuracy),
    };
  });
