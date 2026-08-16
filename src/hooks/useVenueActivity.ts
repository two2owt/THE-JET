import { devLog } from "@/lib/log";
import { useEffect, useId, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Venue } from "@/components/MapboxHeatmap";
import { CITIES, type City } from "@/types/cities";
import { getNeighborhoodForCoords } from "@/data/city-neighborhoods";
import { scoreVenueMomentum } from "@/lib/venue-momentum";

/**
 * Fetch the top 10 most popular venues for the given city
 */
const fetchPopularVenuesFromGooglePlaces = async (city: City): Promise<Venue[]> => {
  try {
    devLog(`Fetching top 10 ${city.name} venues...`);

    const cityLocation = { lat: city.lat, lng: city.lng };

    const { data, error } = await supabase.functions.invoke('search-google-places-venues', {
      body: { location: cityLocation }
    });

    if (error) {
      console.error('Error fetching venues:', error);
      return [];
    }

    // Map the response to our Venue interface
    const venues: Venue[] = (data?.venues || []).map((v: any) => ({
      id: v.id,
      name: v.name,
      lat: v.lat,
      lng: v.lng,
      activity: v.activity || 50,
      category: v.category || 'Venue',
      neighborhood: getNeighborhoodForCoords(city.id, v.lat, v.lng),
      address: v.address,
      googleRating: v.googleRating,
      googleTotalRatings: v.googleTotalRatings,
      isOpen: v.isOpen,
      openingHours: v.openingHours || [],
      phone: v.phone,
      website: v.website,
    }));
    
    devLog(`Fetched ${venues.length} ${city.name} venues:`);
    venues.forEach((v, i) => {
      devLog(`  ${i + 1}. ${v.name}: lat=${v.lat}, lng=${v.lng} | ${v.address || 'No address'}`);
    });
    return venues;
  } catch (error) {
    console.error('Error in fetchPopularVenuesFromGooglePlaces:', error);
    return [];
  }
};

/**
 * Hook to fetch real venue activity data from Supabase and Google Places
 */
export const useVenueActivity = (enabled: boolean = true, city: City = CITIES[0]) => {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const channelId = useId();
  const lastLoadRef = useRef(0);
  const pendingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadVenueActivity = async () => {
    try {
      setLoading(true);
      setError(null);
      lastLoadRef.current = Date.now();

      // First, fetch popular venues from Google Places as the base dataset
      const googleVenues = await fetchPopularVenuesFromGooglePlaces(city);
      
      // Then, enhance with our own platform data (deals, engagement, etc.)
      const { data: deals, error: dealsError } = await supabase
          .from('deals')
          .select(`
            venue_id,
            venue_name,
            venue_address,
            neighborhood_id,
            created_at,
            neighborhoods!inner(
              name,
              center_lat,
              center_lng
            )
          `)
          .eq('active', true)
          .gte('expires_at', new Date().toISOString())
          .lte('starts_at', new Date().toISOString());

      if (dealsError) {
        console.warn('Error fetching deals:', dealsError);
      }

      // Aggregate venue metrics from deals
      const venueEngagementMap = new Map<string, {
        dealCount: number;
        recentDealCount: number;
        favoriteCount: number;
        shareCount: number;
      }>();
      
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      deals?.forEach((deal: any) => {
        const key = deal.venue_id;
        const existing = venueEngagementMap.get(key);
        const isRecent = new Date(deal.created_at) > sevenDaysAgo;

        if (existing) {
          existing.dealCount++;
          if (isRecent) existing.recentDealCount++;
        } else {
          venueEngagementMap.set(key, {
            dealCount: 1,
            recentDealCount: isRecent ? 1 : 0,
            favoriteCount: 0,
            shareCount: 0,
          });
        }
      });

      // Fetch engagement metrics (favorites and shares) for venues with deals
      const venueIds = Array.from(venueEngagementMap.keys());
      
      if (venueIds.length > 0) {
        const { data: dealIds } = await supabase
          .from('deals')
          .select('id, venue_id')
          .in('venue_id', venueIds);

        if (dealIds && dealIds.length > 0) {
          const dealIdsArray = dealIds.map(d => d.id);

          // Get favorites count
          const { data: favorites } = await supabase
            .from('user_favorites')
            .select('deal_id')
            .in('deal_id', dealIdsArray);

          // Get shares count
          const { data: shares } = await supabase
            .from('deal_shares')
            .select('deal_id')
            .in('deal_id', dealIdsArray);

          // Update engagement map
          dealIds.forEach(dealMapping => {
            const engagement = venueEngagementMap.get(dealMapping.venue_id);
            if (engagement) {
              engagement.favoriteCount += favorites?.filter(f => f.deal_id === dealMapping.id).length || 0;
              engagement.shareCount += shares?.filter(s => s.deal_id === dealMapping.id).length || 0;
            }
          });
        }
      }

      // Enhance Google Places venues with our engagement data
      const enhancedVenues = googleVenues.map(venue => {
        const engagement = venueEngagementMap.get(venue.id);
        
        if (engagement) {
          // Boost activity score for venues with deals/engagement
          const engagementBoost = Math.min(30, 
            (engagement.dealCount * 5) + 
            (engagement.recentDealCount * 10) + 
            (engagement.favoriteCount * 2) + 
            (engagement.shareCount * 2)
          );
          
          return {
            ...venue,
            activity: Math.min(100, venue.activity + engagementBoost),
          };
        }
        
        return venue;
      });

      // Second pass: momentum. Compares each venue against its own recent
      // baseline with a 25-minute half-life, so "filling up" beats "big".
      const now = Date.now();
      const withMomentum = enhancedVenues.map((venue) => {
        const momentum = scoreVenueMomentum(venue.id, venue.activity, now);
        return {
          ...venue,
          activity: momentum.adjustedActivity,
          momentum: momentum.score,
          momentumTrend: momentum.trend,
          momentumLabel: momentum.label,
        };
      });

      // Sort by activity, breaking ties toward venues that are on the way up.
      const sortedVenues = withMomentum.sort(
        (a, b) => b.activity - a.activity || (b.momentum ?? 0) - (a.momentum ?? 0),
      );
      
      devLog(`Loaded ${sortedVenues.length} venues with activity scores`);
      setVenues(sortedVenues);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Error loading venue activity:', err);
      setError(err instanceof Error ? err.message : 'Failed to load venue data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Skip initialization if disabled (deferred loading)
    if (!enabled) return;
    
    loadVenueActivity();

    // Realtime tables like user_locations fire constantly; coalesce refreshes
    // to at most one Google Places round-trip per 60s so the map doesn't
    // thrash (and burn quota) on every location ping.
    const REFRESH_INTERVAL_MS = 60_000;
    const scheduleRefresh = () => {
      if (pendingRef.current) return;
      const wait = Math.max(0, REFRESH_INTERVAL_MS - (Date.now() - lastLoadRef.current));
      pendingRef.current = setTimeout(() => {
        pendingRef.current = null;
        loadVenueActivity();
      }, wait);
    };

    // Set up real-time subscription for deal changes
    const channel = supabase
      .channel(`venue-activity-changes-${channelId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'deals'
        },
        () => {
          devLog('Deal change detected, refreshing venue activity');
          scheduleRefresh();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'user_locations'
        },
        () => {
          devLog('User location update detected, refreshing venue activity');
          scheduleRefresh();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_favorites'
        },
        () => {
          devLog('Favorites change detected, refreshing venue activity');
          scheduleRefresh();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'deal_shares'
        },
        () => {
          devLog('Deal share detected, refreshing venue activity');
          scheduleRefresh();
        }
      )
      .subscribe();

    // Resume paths: tab/PWA foreground, bfcache restore (browser bookmarks,
    // back button), and network reconnect after offline use.
    const resync = () => scheduleRefresh();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") resync();
    };
    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) resync();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("online", resync);

    // Refetch once auth becomes available (the venue search requires a JWT).
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        scheduleRefresh();
      }
    });

    return () => {
      if (pendingRef.current) clearTimeout(pendingRef.current);
      pendingRef.current = null;
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("online", resync);
      subscription.unsubscribe();
    };
  }, [enabled, city.id]);

  return { venues, loading, error, refresh: loadVenueActivity, lastUpdated };
};
