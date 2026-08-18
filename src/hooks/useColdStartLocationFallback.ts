import { useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getNetworkLocation } from "@/lib/networkGeolocation";
import { logGeoPermissionEvent } from "@/lib/locationPermissionLog";
import { logGeoEvent } from "@/lib/geoDiagnostics";
import { recordLocationWrite, recordLocationSkip } from "@/lib/locationDiagnostics";
import {
  getLocationFreshness,
  writeCoarseLocationFallback,
} from "@/lib/location-fallback.functions";

/** Only attempt this once per app open (per tab). */
let attemptedForUser: string | null = null;

/**
 * Cold-start location fallback.
 *
 * On app open, asks the server whether the signed-in user has any location fix
 * in the last 24h. If not — GPS denied, app never opened, background tracking
 * unavailable — it resolves a coarse network (Wi-Fi/IP) fix in the browser and
 * asks the server to store it. When the browser can't produce anything, the
 * server falls back to the edge's IP-derived city-level coordinates, so the
 * heatmap and flow paths never go empty for that user.
 */
export function useColdStartLocationFallback() {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const runningRef = useRef(false);

  useEffect(() => {
    if (!userId) return;
    if (attemptedForUser === userId) return;
    if (runningRef.current) return;
    attemptedForUser = userId;
    runningRef.current = true;

    let cancelled = false;

    void (async () => {
      try {
        const freshness = await getLocationFreshness();
        if (cancelled || !freshness.stale) return;

        // Coarse browser-side lookup first (better than city-level IP).
        const network = await getNetworkLocation(true).catch(() => null);
        if (cancelled) return;

        const result = await writeCoarseLocationFallback({
          data: {
            lat: network?.lat ?? null,
            lng: network?.lng ?? null,
            accuracy: network?.accuracy ?? null,
          },
        });
        if (cancelled) return;

        if (result.written) {
          logGeoEvent({
            kind: "write",
            source: "network",
            fallbackUsed: true,
            accuracy: result.accuracy,
            reason: `cold-start fallback (${result.source})`,
          });
          recordLocationWrite("network");
          logGeoPermissionEvent({
            outcome: "fallback_used",
            surface: "cold_start",
            method: network ? "network_fallback" : "ip_fallback",
            fallbackUsed: true,
            detail: `written via ${result.source}`,
          });
        } else {
          logGeoEvent({
            kind: "skipped",
            source: "network",
            fallbackUsed: true,
            accuracy: null,
            reason: `cold-start fallback: ${result.reason}`,
          });
          recordLocationSkip(`cold-start fallback: ${result.reason}`);
          logGeoPermissionEvent({
            outcome: "fallback_used",
            surface: "cold_start",
            method: network ? "network_fallback" : "ip_fallback",
            fallbackUsed: true,
            detail: `skipped: ${result.reason}`,
          });
        }
      } catch (err) {
        if (import.meta.env.DEV)
          console.debug("[cold-start-location] failed", err);
        // Allow a retry on the next app open.
        attemptedForUser = null;
      } finally {
        runningRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);
}

export default useColdStartLocationFallback;
