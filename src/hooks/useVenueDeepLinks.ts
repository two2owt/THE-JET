import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { toast } from "sonner";
import { useSearchParams } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { useDeepLinking } from "@/hooks/useDeepLinking";
import {
  trackDeepLinkOpened,
  trackDeepLinkFallback,
  trackDeepLinkFailed,
  inferDeepLinkSurface,
} from "@/lib/deepLinkAnalytics";
import type { Venue } from "@/types/venue";
import type { City } from "@/types/cities";
import type { NavTab } from "@/hooks/useBottomNavigation";

interface UseVenueDeepLinksOptions {
  /** Venues currently loaded for the active city. */
  venues: Venue[];
  venuesLoading: boolean;
  /** Used as the coordinate fallback when a venue isn't in the loaded set. */
  selectedCity: City;
  getVenueImage: (name: string) => string | undefined;
  setActiveTab: (tab: NavTab) => void;
  /** JetCard container, scrolled into view once a deep link resolves. */
  jetCardRef: RefObject<HTMLDivElement | null>;
}

/**
 * Owns everything about "which venue is open" and how that maps to the URL:
 *
 *  - `selectedVenue` state (the JetCard subject)
 *  - two-way sync with the `?venue=<id>` param so an open card survives
 *    reloads and is shareable
 *  - the resolution chain for deep links: loaded venues -> favorite snapshot
 *    -> deal record -> city-center fallback -> "venue not found"
 *  - `?deal=` handling via `useDeepLinking`
 *  - funnel analytics for every open / fallback / failure
 *
 * Keeping this out of the page means new cities inherit the same routing
 * behaviour with no page edits.
 */
export function useVenueDeepLinks({
  venues,
  venuesLoading,
  selectedCity,
  getVenueImage,
  setActiveTab,
  jetCardRef,
}: UseVenueDeepLinksOptions) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);

  // Funnel: fire "Deal Viewed" once per JetCard open (transition null -> venue).
  const lastTrackedVenueRef = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedVenue) {
      lastTrackedVenueRef.current = null;
      return;
    }
    if (lastTrackedVenueRef.current === selectedVenue.id) return;
    lastTrackedVenueRef.current = selectedVenue.id;
    import("@/lib/analytics")
      .then(({ analytics }) => {
        analytics.dealViewed(selectedVenue.id, selectedVenue.name, {
          category: selectedVenue.category,
          neighborhood: selectedVenue.neighborhood,
          activity: selectedVenue.activity,
        });
      })
      .catch(() => {});
  }, [selectedVenue]);

  const scrollToCard = useCallback(() => {
    setTimeout(() => {
      jetCardRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 300);
  }, [jetCardRef]);

  const venueRestoredRef = useRef(false);
  // Tracks which `?venue=` value we've already tried to resolve, so links
  // opened later in the session (e.g. tapping a saved deal on /favorites)
  // get the same rehydration path as a cold load.
  const resolvedVenueParamRef = useRef<string | null>(null);

  useEffect(() => {
    // Wait for the first venue load to settle, but don't require a non-empty
    // set: favorites resolve from their own snapshot when the map list misses.
    if (venuesLoading) return;
    const venueParam = searchParams.get("venue");
    if (!venueParam) {
      venueRestoredRef.current = true;
      resolvedVenueParamRef.current = null;
      return;
    }
    if (resolvedVenueParamRef.current === venueParam) return;
    resolvedVenueParamRef.current = venueParam;
    const decoded = decodeURIComponent(venueParam);
    const decodedLower = decoded.toLowerCase();
    // Prefer exact id match; fall back to case-insensitive name match so
    // links shared before the id migration keep working.
    const match =
      venues.find((v) => v.id === decoded) ??
      venues.find((v) => v.name.toLowerCase() === decodedLower);
    if (match) {
      setSelectedVenue({
        ...match,
        imageUrl: getVenueImage(match.name) || match.imageUrl,
      });
      trackDeepLinkOpened(
        "venue",
        decoded,
        inferDeepLinkSurface(searchParams),
        "loaded_venues",
      );
      venueRestoredRef.current = true;
      return;
    }

    venueRestoredRef.current = true;
    let cancelled = false;
    void (async () => {
      // A saved favorite carries a full venue snapshot, so rehydrate the
      // JetCard from it — a closed or out-of-city venue must still open.
      const { data } = await supabase
        .from("user_favorites")
        .select(
          "venue_id, venue_name, venue_address, venue_category, venue_neighborhood, venue_image_url, venue_lat, venue_lng",
        )
        .eq("venue_id", decoded)
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      if (data?.venue_id && data.venue_lat != null && data.venue_lng != null) {
        const name = data.venue_name || decoded;
        const surface = inferDeepLinkSurface(searchParams);
        trackDeepLinkOpened("venue", decoded, surface, "favorite_snapshot");
        trackDeepLinkFallback(
          "venue",
          decoded,
          surface,
          "favorite_snapshot",
          "venue_not_in_loaded_set",
        );
        setSelectedVenue({
          id: data.venue_id,
          name,
          lat: Number(data.venue_lat),
          lng: Number(data.venue_lng),
          activity: 0,
          category: data.venue_category || "Venue",
          neighborhood: data.venue_neighborhood || "",
          address: data.venue_address || undefined,
          imageUrl: getVenueImage(name) || data.venue_image_url || undefined,
        });
        return;
      }

      // Still unresolved — a deal deep link may point at a venue outside the
      // currently loaded (city/active-filtered) set. Rehydrate from the deal
      // record so the JetCard still opens instead of dead-ending.
      const { data: dealVenue } = await supabase
        .from("deals")
        .select("venue_id, venue_name, venue_address, deal_type, image_url")
        .eq("venue_id", decoded)
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      if (dealVenue?.venue_id) {
        const name = dealVenue.venue_name || decoded;
        const surface = inferDeepLinkSurface(searchParams);
        trackDeepLinkOpened("venue", decoded, surface, "city_center_fallback");
        trackDeepLinkFallback(
          "venue",
          decoded,
          surface,
          "city_center_fallback",
          "resolved_from_deal_record",
        );
        setSelectedVenue({
          id: dealVenue.venue_id,
          name,
          lat: selectedCity.lat,
          lng: selectedCity.lng,
          activity: 0,
          category: dealVenue.deal_type || "Venue",
          neighborhood: "",
          address: dealVenue.venue_address || undefined,
          imageUrl: getVenueImage(name) || dealVenue.image_url || undefined,
        });
        return;
      }

      // Genuinely unresolvable — strip the stale param so a reload doesn't
      // keep retrying the miss.
      toast.error("Venue not found", {
        description: "That venue link is no longer available.",
      });
      trackDeepLinkFailed(
        "venue",
        decoded,
        inferDeepLinkSurface(searchParams),
        "venue_not_found",
      );
      const next = new URLSearchParams(searchParams);
      next.delete("venue");
      setSearchParams(next, { replace: true });
    })();

    return () => {
      cancelled = true;
    };
  }, [
    venues,
    venuesLoading,
    searchParams,
    setSearchParams,
    getVenueImage,
    selectedCity,
  ]);

  // selectedVenue -> URL
  useEffect(() => {
    // Don't write the URL until the initial restoration pass has run, or we
    // could blow away a deep-linked `?venue=` before it's read.
    if (!venueRestoredRef.current) return;
    const currentParam = searchParams.get("venue");
    const nextParam = selectedVenue
      ? encodeURIComponent(selectedVenue.id)
      : null;
    if (currentParam === nextParam) return;
    const next = new URLSearchParams(searchParams);
    if (nextParam) next.set("venue", nextParam);
    else next.delete("venue");
    // Push a new history entry on the "open" transition (no venue -> venue)
    // so Back closes the JetCard while preserving any active `?q=` search.
    // Replace for venue swaps and closes, so we don't pollute history.
    const isOpening = !currentParam && !!nextParam;
    setSearchParams(next, { replace: !isOpening });
  }, [selectedVenue, searchParams, setSearchParams]);

  // `?deal=` — select the venue associated with the deal.
  const handleDeepLinkDeal = useCallback(
    async (dealId: string, dealData: any) => {
      setActiveTab("map");

      const venueFromDeal: Venue = {
        id: dealData.venue_id,
        name: dealData.venue_name,
        lat: selectedCity.lat, // Default to city center if no coords
        lng: selectedCity.lng,
        activity: 80,
        category: dealData.deal_type || "Deal",
        neighborhood: "",
        address: dealData.venue_address,
        imageUrl: dealData.image_url || getVenueImage(dealData.venue_name),
      };

      // Prefer the stable id, then fall back to a name match.
      const existingVenue =
        venues.find((v) => v.id === dealData.venue_id) ??
        venues.find(
          (v) =>
            v.name.toLowerCase() ===
            String(dealData.venue_name ?? "").toLowerCase(),
        );

      if (existingVenue) {
        setSelectedVenue({
          ...existingVenue,
          imageUrl:
            dealData.image_url ||
            getVenueImage(existingVenue.name) ||
            existingVenue.imageUrl,
          address: dealData.venue_address || existingVenue.address,
        });
        trackDeepLinkOpened(
          "deal",
          dealId,
          inferDeepLinkSurface(window.location.search),
          "loaded_venues",
        );
      } else {
        setSelectedVenue(venueFromDeal);
        const surface = inferDeepLinkSurface(window.location.search);
        trackDeepLinkOpened("deal", dealId, surface, "city_center_fallback");
        trackDeepLinkFallback(
          "deal",
          dealId,
          surface,
          "city_center_fallback",
          dealData.venue_id
            ? "venue_not_in_loaded_set"
            : "deal_missing_venue_id",
        );
      }

      scrollToCard();
    },
    [venues, selectedCity, getVenueImage, setActiveTab, scrollToCard],
  );

  // `?venue=` from an in-session navigation. Accepts a stable venue id
  // (preferred) or a legacy venue name for backward compatibility.
  const handleDeepLinkVenue = useCallback(
    (venueIdOrName: string) => {
      setActiveTab("map");
      const lower = venueIdOrName.toLowerCase();
      const venue =
        venues.find((v) => v.id === venueIdOrName) ??
        venues.find((v) => v.name.toLowerCase() === lower);

      if (venue) {
        setSelectedVenue({
          ...venue,
          imageUrl: getVenueImage(venue.name) || venue.imageUrl,
        });
        scrollToCard();
      } else {
        // The `?venue=` restore effect owns the async fallback chain; record
        // that the in-memory lookup missed so fallbacks are measurable.
        trackDeepLinkFallback(
          "venue",
          venueIdOrName,
          inferDeepLinkSurface(window.location.search),
          "favorite_snapshot",
          "venue_not_in_loaded_set",
        );
      }
    },
    [venues, getVenueImage, setActiveTab, scrollToCard],
  );

  useDeepLinking({
    onDealOpen: handleDeepLinkDeal,
    onVenueOpen: handleDeepLinkVenue,
  });

  return { selectedVenue, setSelectedVenue };
}
