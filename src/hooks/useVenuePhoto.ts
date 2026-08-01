import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface VenuePhotoInput {
  id: string;
  name: string;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  placeId?: string | null;
}

// Session-level cache so re-opening the same JetCard doesn't re-hit the API.
const photoCache = new Map<string, string | null>();

/**
 * Resolve the venue's Google Places photo. Returns null while loading or when
 * Places has no photo, so callers can fall back to their own imageUrl.
 */
export const useVenuePhoto = (venue: VenuePhotoInput | null, maxWidth = 800) => {
  const key = venue ? `${venue.placeId || venue.id}|${venue.name}` : "";
  const [photoUrl, setPhotoUrl] = useState<string | null>(() => photoCache.get(key) ?? null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!venue || !venue.name) return;
    if (photoCache.has(key)) {
      setPhotoUrl(photoCache.get(key) ?? null);
      return;
    }

    let cancelled = false;
    const run = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || cancelled) return;
      setLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("get-venue-photo", {
          body: {
            name: venue.name,
            address: venue.address ?? undefined,
            lat: typeof venue.lat === "number" ? venue.lat : undefined,
            lng: typeof venue.lng === "number" ? venue.lng : undefined,
            placeId: venue.placeId ?? undefined,
            maxWidth,
          },
        });
        if (cancelled) return;
        const url = !error && data?.photoUrl ? (data.photoUrl as string) : null;
        photoCache.set(key, url);
        setPhotoUrl(url);
      } catch {
        if (!cancelled) setPhotoUrl(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [key, venue?.name, venue?.address, venue?.lat, venue?.lng, venue?.placeId, maxWidth]);

  return { photoUrl, loading };
};
