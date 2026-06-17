import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Deal = Database['public']['Tables']['deals']['Row'];

interface UserPreferences {
  categories?: string[];
  food?: {
    cuisineType?: string[];
    dietaryPreference?: string[];
    mealOccasion?: string[];
  };
  drink?: {
    coffeeTea?: string[];
    barCocktail?: string[];
    atmosphere?: string[];
  };
  nightlife?: {
    venueType?: string[];
    musicPreference?: string[];
    crowdVibe?: string[];
  };
  events?: {
    eventType?: string[];
    groupType?: string[];
    timeSetting?: string[];
  };
  trendingVenues?: boolean;
  activityInArea?: boolean;
}

// Map deal_type values to preference categories
const dealTypeToCategory: Record<string, string> = {
  'food': 'Food',
  'Food': 'Food',
  'restaurant': 'Food',
  'dining': 'Food',
  'drinks': 'Drinks',
  'Drinks': 'Drinks',
  'bar': 'Drinks',
  'cocktail': 'Drinks',
  'coffee': 'Drinks',
  'nightlife': 'Nightlife',
  'Nightlife': 'Nightlife',
  'club': 'Nightlife',
  'lounge': 'Nightlife',
  'events': 'Events',
  'Events': 'Events',
  'concert': 'Events',
  'festival': 'Events',
};

// Cache deals for offline page
const cacheDealsForOffline = (deals: Deal[]) => {
  try {
    const cached = deals.slice(0, 10).map(d => ({
      title: d.title,
      venue_name: d.venue_name,
      deal_type: d.deal_type
    }));
    localStorage.setItem('jet-cached-deals', JSON.stringify(cached));
  } catch (e) {
    // Ignore storage errors
  }
};

export const useDeals = (enablePreferenceFilter: boolean = false, enabled: boolean = true) => {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [filteredDeals, setFilteredDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [userPreferences, setUserPreferences] = useState<UserPreferences | null>(null);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadUserPreferences = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setPreferencesLoaded(true);
        return null;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('preferences')
        .eq('id', user.id)
        .single();

      if (error) throw error;
      
      const prefs = data?.preferences as UserPreferences | null;
      setUserPreferences(prefs);
      setPreferencesLoaded(true);
      return prefs;
    } catch (err) {
      console.error('Error loading user preferences:', err);
      setPreferencesLoaded(true);
      return null;
    }
  }, []);

  const filterDealsByPreferences = useCallback((allDeals: Deal[], prefs: UserPreferences | null) => {
    // If filtering is disabled or no preferences, return all deals
    if (!enablePreferenceFilter || !prefs || !prefs.categories || prefs.categories.length === 0) {
      return allDeals;
    }

    const selectedCategories = prefs.categories;

    return allDeals.filter(deal => {
      const dealCategory = dealTypeToCategory[deal.deal_type] || deal.deal_type;
      
      // Check if deal matches any selected category
      const matchesCategory = selectedCategories.some(cat => 
        cat.toLowerCase() === dealCategory.toLowerCase()
      );

      if (!matchesCategory) return false;

      // Additional filtering based on subcategory preferences
      const dealType = deal.deal_type.toLowerCase();
      const title = deal.title.toLowerCase();
      const description = deal.description.toLowerCase();
      const searchText = `${title} ${description} ${dealType}`;

      // Food-specific filtering
      if ((dealCategory === 'Food' || dealType === 'food') && prefs.food) {
        const { cuisineType = [], mealOccasion = [] } = prefs.food;
        
        // If user has specific preferences, check if deal mentions them
        if (cuisineType.length > 0 || mealOccasion.length > 0) {
          const matchesCuisine = cuisineType.length === 0 || cuisineType.some(c => 
            searchText.includes(c.toLowerCase())
          );
          const matchesMeal = mealOccasion.length === 0 || mealOccasion.some(m => 
            searchText.includes(m.toLowerCase())
          );
          // Boost score but don't exclude - just prioritize
          return matchesCuisine || matchesMeal || true;
        }
      }

      // Drinks-specific filtering
      if ((dealCategory === 'Drinks' || dealType === 'drinks') && prefs.drink) {
        const { barCocktail = [], coffeeTea = [] } = prefs.drink;
        
        if (barCocktail.length > 0 || coffeeTea.length > 0) {
          const matchesBar = barCocktail.length === 0 || barCocktail.some(b => 
            searchText.includes(b.toLowerCase())
          );
          const matchesCoffee = coffeeTea.length === 0 || coffeeTea.some(c => 
            searchText.includes(c.toLowerCase())
          );
          return matchesBar || matchesCoffee || true;
        }
      }

      // Nightlife-specific filtering
      if ((dealCategory === 'Nightlife' || dealType === 'nightlife') && prefs.nightlife) {
        const { venueType = [], musicPreference = [] } = prefs.nightlife;
        
        if (venueType.length > 0 || musicPreference.length > 0) {
          const matchesVenue = venueType.length === 0 || venueType.some(v => 
            searchText.includes(v.toLowerCase())
          );
          const matchesMusic = musicPreference.length === 0 || musicPreference.some(m => 
            searchText.includes(m.toLowerCase())
          );
          return matchesVenue || matchesMusic || true;
        }
      }

      // Events-specific filtering
      if ((dealCategory === 'Events' || dealType === 'events') && prefs.events) {
        const { eventType = [] } = prefs.events;
        
        if (eventType.length > 0) {
          const matchesEvent = eventType.some(e => 
            searchText.includes(e.toLowerCase())
          );
          return matchesEvent || true;
        }
      }

      return true;
    });
  }, [enablePreferenceFilter]);

  const loadDeals = useCallback(async () => {
    try {
      // Check for prefetched data from index.html early load script
      const prefetchedDeals = (window as any).__PREFETCHED_DATA__?.deals;
      
      if (prefetchedDeals && Array.isArray(prefetchedDeals) && prefetchedDeals.length > 0) {
        // Use prefetched data for instant initial render
        const now = new Date().toISOString();
        const validDeals = prefetchedDeals.filter((deal: Deal) => 
          deal.active && 
          deal.expires_at >= now && 
          deal.starts_at <= now
        );
        
        setDeals(validDeals);
        const filtered = filterDealsByPreferences(validDeals, userPreferences);
        setFilteredDeals(filtered);
        setLastUpdated(new Date());
        setLoading(false);
        
        // Clear prefetched data to avoid stale data on refresh
        delete (window as any).__PREFETCHED_DATA__?.deals;
        
        // Still fetch fresh data in background for updates
        const { data } = await supabase
          .from('deals')
          .select('*')
          .eq('active', true)
          .gte('expires_at', now)
          .lte('starts_at', now)
          .order('created_at', { ascending: false });
        
        if (data && JSON.stringify(data) !== JSON.stringify(validDeals)) {
          setDeals(data);
          const newFiltered = filterDealsByPreferences(data, userPreferences);
          setFilteredDeals(newFiltered);
          setLastUpdated(new Date());
        }
        return;
      }

      // Normal fetch if no prefetched data
      const { data, error: fetchError } = await supabase
        .from('deals')
        .select('*')
        .eq('active', true)
        .gte('expires_at', new Date().toISOString())
        .lte('starts_at', new Date().toISOString())
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      
      const allDeals = data || [];
      setDeals(allDeals);
      
      // Cache deals for offline access
      cacheDealsForOffline(allDeals);
      
      // Apply preference filtering
      const filtered = filterDealsByPreferences(allDeals, userPreferences);
      setFilteredDeals(filtered);
      setLastUpdated(new Date());
      
      setError(null);
    } catch (err) {
      console.error('Error loading deals:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [filterDealsByPreferences, userPreferences]);

  // Re-filter when preferences change
  useEffect(() => {
    if (deals.length > 0) {
      const filtered = filterDealsByPreferences(deals, userPreferences);
      setFilteredDeals(filtered);
    }
  }, [deals, userPreferences, filterDealsByPreferences]);

  useEffect(() => {
    // Skip initialization if disabled (deferred loading)
    if (!enabled) return;
    
    // Load preferences first, then deals
    const init = async () => {
      setLoading(true);
      await loadUserPreferences();
    };
    
    init();
  }, [loadUserPreferences, enabled]);

  useEffect(() => {
    // Skip initialization if disabled or preferences not loaded
    if (!enabled || !preferencesLoaded) return;

    const timer = setTimeout(() => {
      loadDeals();
    }, 100);
    
    const cleanup = () => clearTimeout(timer);

    // Set up real-time subscription
    const channel = supabase
      .channel('deals-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'deals'
        },
        () => {
          loadDeals();
        }
      )
      .subscribe();

    // Listen for visibility changes to refresh on tab focus
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        loadDeals();
        loadUserPreferences();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cleanup();
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled, preferencesLoaded, loadDeals, loadUserPreferences]);

  return { 
    deals: enablePreferenceFilter ? filteredDeals : deals,
    allDeals: deals,
    loading, 
    error, 
    refresh: loadDeals,
    refreshPreferences: loadUserPreferences,
    userPreferences,
    hasPreferences: userPreferences?.categories && userPreferences.categories.length > 0,
    lastUpdated
  };
};
