import { supabase } from "@/integrations/supabase/client";
import { logGeoEvent } from "@/lib/geoDiagnostics";

export interface NetworkFix {
  lat: number;
  lng: number;
  /** Metres — network fixes are coarse (typically 500m–20km). */
  accuracy: number | null;
}

/** Don't hammer the API: one network lookup per this interval, app-wide. */
const MIN_LOOKUP_INTERVAL_MS = 5 * 60_000;
/** Ignore fixes coarser than this — useless for venue-level density. */
export const MAX_NETWORK_ACCURACY_METERS = 5_000;

let lastLookupAt = 0;
let inFlight: Promise<NetworkFix | null> | null = null;

/**
 * Coarse location via the Google Geolocation API (Wi-Fi / cell / IP), proxied
 * through the `get-network-location` edge function so the key stays server-side.
 *
 * Used only as a fallback when the browser/device GPS gives us nothing, so
 * heatmap density and flow paths still receive points from those users.
 */
export async function getNetworkLocation(
  force = false,
): Promise<NetworkFix | null> {
  const now = Date.now();
  if (!force && now - lastLookupAt < MIN_LOOKUP_INTERVAL_MS) return null;
  if (inFlight) return inFlight;

  lastLookupAt = now;
  inFlight = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke(
        "get-network-location",
        {
          body: { considerIp: true },
        },
      );
      if (error || !data?.location) {
        logGeoEvent({
          kind: "rejected",
          source: "network",
          fallbackUsed: true,
          accuracy: null,
          reason: error?.message ?? data?.error ?? "no location returned",
        });
        return null;
      }

      const accuracy = typeof data.accuracy === "number" ? data.accuracy : null;
      if (accuracy !== null && accuracy > MAX_NETWORK_ACCURACY_METERS) {
        logGeoEvent({
          kind: "rejected",
          source: "network",
          fallbackUsed: true,
          accuracy,
          reason: `coarser than ${MAX_NETWORK_ACCURACY_METERS}m accuracy cap`,
        });
        return null;
      }

      return { lat: data.location.lat, lng: data.location.lng, accuracy };
    } catch (err) {
      logGeoEvent({
        kind: "rejected",
        source: "network",
        fallbackUsed: true,
        accuracy: null,
        reason: err instanceof Error ? err.message : "network lookup threw",
      });
      return null;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

export default getNetworkLocation;
