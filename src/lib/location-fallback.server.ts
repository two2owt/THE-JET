import { getRequest } from "@tanstack/react-start/server";

/** A fix older than this makes the user "stale" for heatmap purposes. */
export const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
/** Coarse network fixes are capped so we never store junk-precision points. */
export const MAX_COARSE_ACCURACY_METERS = 25_000;

/** Edge/CDN geo headers, used when the client can't produce any fix at all. */
export function edgeGeoFromHeaders(): {
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

/** Timestamp of the caller's most recent stored location row, if any. */
export async function lastFixAt(
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

export function isStale(at: string | null): boolean {
  if (!at) return true;
  return Date.now() - new Date(at).getTime() > STALE_AFTER_MS;
}
