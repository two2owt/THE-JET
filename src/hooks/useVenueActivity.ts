import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Venue } from "@/components/MapboxHeatmap";

/**
 * Fetch the top 10 most popular venues in Charlotte
 */
const fetchPopularVenuesFromGooglePlaces = async (): Promise<Venue[]> => {
  try {
    console.log('Fetching top 10 Charlotte venues...');
    
    // Charlotte coordinates
    const charlotteLocation = { lat: 35.2271, lng: -80.8431 };
    
    const { data, error } = await supabase.functions.invoke('search-google-places-venues', {
      body: { location: charlotteLocation }
    });

    if (error) {
      console.error('Error fetching venues:', error);
      return [];
    }

    // Map the response to our Venue interface
    const venues: Venue[] = (data.venues || []).map((v: any) => ({
      id: v.id,
      name: v.name,
      lat: v.lat,
      lng: v.lng,
      activity: v.activity || 50,
      category: v.category || 'Venue',
      neighborhood: getNeighborhoodFromCoords(v.lat, v.lng),
      address: v.address,
      googleRating: v.googleRating,
      googleTotalRatings: v.googleTotalRatings,
      isOpen: v.isOpen,
      openingHours: v.openingHours || [],
      phone: v.phone,
      website: v.website,
    }));
    
    console.log(`Fetched ${venues.length} Charlotte venues:`);
    venues.forEach((v, i) => {
      console.log(`  ${i + 1}. ${v.name}: lat=${v.lat}, lng=${v.lng} | ${v.address || 'No address'}`);
    });
    return venues;
  } catch (error) {
    console.error('Error in fetchPopularVenuesFromGooglePlaces:', error);
    return [];
  }
};

/**
 * Determine neighborhood from coordinates
 */
const getNeighborhoodFromCoords = (lat: number, lng: number): string => {
  // Charlotte neighborhoods approximate boundaries
  if (lat >= 35.245) return 'NoDa';
  if (lat >= 35.230 && lng <= -80.820) return 'Camp North End';
  if (lat >= 35.220 && lat < 35.235) return 'Uptown';
  if (lat >= 35.200 && lat < 35.220 && lng >= -80.820) return 'Plaza Midwood';
  if (lat < 35.220 && lng <= -80.840) return 'South End';
  return 'Charlotte';
};

/**
 * Hook to fetch real venue activity data from Supabase and Google Places
 */
export const useVenueActivity = (enabled: boolean = true) => {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadVenueActivity = async () => {
    try {
      setLoading(true);
      setError(null);

      // First, fetch popular venues from Google Places as the base dataset
      const googleVenues = await fetchPopularVenuesFromGooglePlaces();
      
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

      // Sort by activity score
      const sortedVenues = enhancedVenues.sort((a, b) => b.activity - a.activity);
      
      console.log(`Loaded ${sortedVenues.length} venues with activity scores`);
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

    // Set up real-time subscription for deal changes
    const channel = supabase
      .channel('venue-activity-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'deals'
        },
        () => {
          console.log('Deal change detected, refreshing venue activity');
          loadVenueActivity();
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
          console.log('User location update detected, refreshing venue activity');
          loadVenueActivity();
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
          console.log('Favorites change detected, refreshing venue activity');
          loadVenueActivity();
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
          console.log('Deal share detected, refreshing venue activity');
          loadVenueActivity();
        }
      )
      .subscribe();

    // Listen for visibility changes to refresh on tab focus
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        loadVenueActivity();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Refresh whenever auth identity changes (e.g. first paint after the
    // post-sign-in redirect). Without this, queries that fired mid-session-
    // restore can leave the map blank until the user reloads.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event) => {
        if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
          loadVenueActivity();
        }
      }
    );

    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      subscription.unsubscribe();
    };
  }, [enabled]);

  return { venues, loading, error, refresh: loadVenueActivity, lastUpdated };
};
