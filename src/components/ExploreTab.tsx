import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { usePersistentViewState } from "@/hooks/usePersistentViewState";
import { supabase } from "@/integrations/supabase/client";
import { useDebounce } from "@/hooks/useDebounce";
import { Input } from "./ui/input";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { OptimizedImage } from "./ui/optimized-image";
import { VirtualList } from "./ui/virtual-list";
import {
  Search,
  MapPin,
  Clock,
  TrendingUp,
  Filter,
  X,
  Navigation,
  Heart,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { EmptyState } from "./EmptyState";
import { TabPageHeader } from "./TabPageHeader";
import {
  calculateDistance,
  getDynamicRadius,
  formatDistance,
} from "@/utils/geospatialUtils";
import { useFavorites } from "@/hooks/useFavorites";
import { useProfilePulse } from "@/hooks/useProfilePulse";
import { hasConsent, subscribeConsent } from "@/lib/consent";
import { dealMatchesPreferences } from "@/lib/dealCategory";
import { getDealPresentation } from "@/lib/dealPresentation";
import {
  DealCategoryBadge,
  DealExpiryBadge,
  DealTypeBadge,
} from "@/components/deals/DealBadges";

import type { User } from "@supabase/supabase-js";

// Lazy load Sheet and DealDetailCard - only needed when user clicks a deal
const Sheet = lazy(() =>
  import("./ui/sheet").then((m) => ({ default: m.Sheet })),
);
const SheetContent = lazy(() =>
  import("./ui/sheet").then((m) => ({ default: m.SheetContent })),
);
const DealDetailCard = lazy(() =>
  import("./DealDetailCard").then((m) => ({ default: m.DealDetailCard })),
);

/**
 * Last-known position, kept both in module scope (survives tab unmounts) and
 * in localStorage (survives reloads and cold deep-link entries). The list is
 * never allowed to wait on GPS: a cached fix is applied synchronously and any
 * live fix simply refines distances afterwards.
 */
const LOCATION_CACHE_TTL_MS = 5 * 60 * 1000;
const LOCATION_CACHE_KEY = "jet:last-location";

type CachedFix = { lat: number; lng: number; at: number };

const readPersistedLocation = (): CachedFix | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LOCATION_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedFix;
    if (
      typeof parsed?.lat !== "number" ||
      typeof parsed?.lng !== "number" ||
      typeof parsed?.at !== "number"
    )
      return null;
    return parsed;
  } catch {
    return null;
  }
};

let lastKnownLocation: CachedFix | null = readPersistedLocation();

const rememberLocation = (fix: CachedFix) => {
  lastKnownLocation = fix;
  try {
    window.localStorage.setItem(LOCATION_CACHE_KEY, JSON.stringify(fix));
  } catch {
    /* storage full or blocked — module cache still applies */
  }
};

const freshCachedLocation = (): CachedFix | null =>
  lastKnownLocation && Date.now() - lastKnownLocation.at < LOCATION_CACHE_TTL_MS
    ? lastKnownLocation
    : null;


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

// Deal → preference bucket resolution lives in @/lib/dealCategory: merchant
// deal_type is only "offer" / "event" / "special", so the bucket is inferred
// from the venue taxonomy behind the deal's text.

interface Deal {
  id: string;
  title: string;
  description: string;
  venue_name: string;
  /** Stable merchant venue id — preferred for deep links. */
  venue_id?: string | null;

  deal_type: string;
  expires_at: string;
  image_url: string | null;
  website_url: string | null;
  neighborhood_id: string | null;
  neighborhoods?: {
    id: string;
    name: string;
    center_lat: number;
    center_lng: number;
  } | null;
  distance?: number; // Distance from user in km
}

interface ExploreTabProps {
  onVenueSelect?: (venue: { id?: string | null; name: string }) => void;
  deals?: Deal[];
  dealsLoading?: boolean;
  dealsError?: Error | null;
}

export const ExploreTab = ({
  onVenueSelect,
  deals: dealsProp,
  dealsLoading: dealsLoadingProp,
  dealsError: dealsErrorProp,
}: ExploreTabProps) => {
  // Persisted per tab so leaving /deals and coming back restores the view.
  const [searchQuery, setSearchQuery] = usePersistentViewState(
    "deals:query",
    "",
  );
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const [deals, setDeals] = useState<Deal[]>(dealsProp || []);
  const [filteredDeals, setFilteredDeals] = useState<Deal[]>([]);
  const [isLoading, setIsLoading] = useState(
    dealsProp === undefined ? true : dealsLoadingProp ?? false,
  );
  const [dealsError, setDealsError] = useState<Error | null>(
    dealsErrorProp || null,
  );
  const [selectedCategories, setSelectedCategories] = usePersistentViewState<
    string[]
  >("deals:categories", []);
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  // Seed from the persisted fix so a cold load / deep-link entry can render
  // distances immediately instead of blocking on a GPS round-trip.
  const [userLocation, setUserLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(() => {
    const cached = freshCachedLocation();
    return cached ? { lat: cached.lat, lng: cached.lng } : null;
  });
  const [locationError, setLocationError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [userPreferences, setUserPreferences] =
    useState<UserPreferences | null>(null);
  // Show-all is the default: every active merchant deal is listed regardless of
  // whether the user currently sits inside the merchant's broadcast radius.
  // (Push notifications still respect the merchant geofence.)
  const [preferenceFilterEnabled, setPreferenceFilterEnabled] =
    usePersistentViewState("deals:prefFilter", false);
  // Opt-in client-side radius filter, toggled from the location badge.
  const [locationFilterEnabled, setLocationFilterEnabled] =
    usePersistentViewState("deals:locFilter", false);

  const { isFavorite, toggleFavorite } = useFavorites(user?.id);

  // Sync local deal state with the prop when provided (realtime hook).
  useEffect(() => {
    if (dealsProp !== undefined) {
      setDeals(dealsProp);
      setIsLoading(dealsLoadingProp ?? false);
      setDealsError(dealsErrorProp || null);
    }
  }, [dealsProp, dealsLoadingProp, dealsErrorProp]);

  // Update available categories whenever the deal list changes.
  useEffect(() => {
    const categories = [...new Set(deals.map((d) => d.deal_type))].sort();
    setAvailableCategories(categories);
  }, [deals]);

  const loadUserPreferences = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("preferences")
        .eq("id", userId)
        .single();

      if (error) throw error;

      const prefs = data?.preferences as UserPreferences | null;
      setUserPreferences(prefs);
    } catch (err) {
      console.error("Error loading user preferences:", err);
    }
  }, []);

  // Preference edits propagate instantly to the deals list.
  useProfilePulse(() => {
    if (user?.id) void loadUserPreferences(user.id);
  }, !!user?.id);

  useEffect(() => {
    void getUserLocation();


    // Get current user
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadUserPreferences(session.user.id);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadUserPreferences(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, [loadUserPreferences]);

  // Consents load asynchronously after sign-in; retry the location read once
  // foreground location is confirmed on so the tab isn't stuck on the
  // "consent is disabled" state.
  useEffect(() => {
    return subscribeConsent((s) => {
      if (s.foreground_location && !userLocation) {
        void getUserLocation();
      }
    });
  }, [userLocation]);



  useEffect(() => {
    // Skip internal fetch when deals are supplied from the page-level
    // realtime hook.
    if (dealsProp !== undefined) return;

    // Never gate the list on a location fix: fetch immediately and let
    // distances fill in when (or if) a position arrives.
    loadDeals();
  }, [dealsProp]);

  useEffect(() => {
    filterDeals();
  }, [
    debouncedSearchQuery,
    deals,
    selectedCategories,
    userPreferences,
    preferenceFilterEnabled,
    locationFilterEnabled,
    userLocation,
  ]);

  const getUserLocation = async () => {
    // A cached coarse fix is good enough for distance sorting, and it means a
    // tab switch renders distances immediately instead of waiting on the GPS.
    const cached = lastKnownLocation;
    if (cached && Date.now() - cached.at < LOCATION_CACHE_TTL_MS) {
      setUserLocation({ lat: cached.lat, lng: cached.lng });
      setLocationError(null);
      return;
    }

    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported by your browser");
      return;
    }

    // Runtime guard: foreground location requires consent. It is opt-out, so
    // it is normally on — but if the account-level record says off while the
    // browser permission is already granted, honour the browser grant instead
    // of blocking (and never toast the user about it here).
    let allowed = hasConsent("foreground_location");
    if (!allowed && navigator.permissions?.query) {
      try {
        const status = await navigator.permissions.query({
          name: "geolocation" as PermissionName,
        });
        allowed = status.state === "granted";
      } catch {
        /* permissions API unavailable — fall through to the consent value */
      }
    }
    if (!allowed) {
      setLocationError("Foreground location consent is disabled");
      return;
    }


    navigator.geolocation.getCurrentPosition(
      (position) => {
        lastKnownLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          at: Date.now(),
        };
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setLocationError(null);
      },
      (error) => {
        console.error("Error getting location:", error);
        setLocationError("Unable to access your location");
        // Show warning but don't block - show all deals if location unavailable
        toast.error("Location access denied", {
          description:
            "Showing all deals. Enable location for personalized results.",
        });
      },
      {
        // Deals are sorted by neighbourhood distance, so a coarse fix is
        // plenty — high accuracy costs seconds of spin-up for no benefit.
        enableHighAccuracy: false,
        timeout: 8000,
        maximumAge: LOCATION_CACHE_TTL_MS,
      },
    );
  };

  const loadDeals = async () => {
    try {
      setIsLoading(true);
      setDealsError(null);
      const { data, error } = await supabase
        .from("deals")
        .select(
          `
          *,
          neighborhoods (
            id,
            name,
            center_lat,
            center_lng
          )
        `,
        )
        .eq("active", true)
        .gte("expires_at", new Date().toISOString())
        .lte("starts_at", new Date().toISOString())
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Calculate distances for deals with neighborhood data
      const dealsWithDistance = (data || []).map((deal) => {
        if (userLocation && deal.neighborhoods) {
          const distance = calculateDistance(
            userLocation.lat,
            userLocation.lng,
            deal.neighborhoods.center_lat,
            deal.neighborhoods.center_lng,
          );
          return { ...deal, distance };
        }
        return deal;
      });

      setDeals(dealsWithDistance as unknown as Deal[]);
    } catch (error) {
      console.error("Error loading deals:", error);
      setDealsError(error as Error);
      toast.error("Failed to load deals");
    } finally {
      setIsLoading(false);
    }
  };

  const recalculateDealDistances = useCallback(() => {
    if (!userLocation) return;
    setDeals((prev) =>
      prev.map((deal) => {
        if (deal.neighborhoods) {
          const distance = calculateDistance(
            userLocation.lat,
            userLocation.lng,
            deal.neighborhoods.center_lat,
            deal.neighborhoods.center_lng,
          );
          return { ...deal, distance };
        }
        return deal;
      }),
    );
  }, [userLocation]);

  useEffect(() => {
    recalculateDealDistances();
  }, [userLocation, recalculateDealDistances]);

  const filterDeals = () => {
    let filtered = [...deals];

    // Apply preference-based filter if enabled - but only if it would leave some results
    if (
      preferenceFilterEnabled &&
      userPreferences?.categories &&
      userPreferences.categories.length > 0
    ) {
      const filteredByPreference = filtered.filter((deal) =>
        dealMatchesPreferences(deal, userPreferences.categories),
      );

      // Only apply preference filter if it leaves some results, otherwise show all
      if (filteredByPreference.length > 0) {
        filtered = filteredByPreference;
      }
    }

    // Optional client-side radius filter. Off by default so every active
    // merchant deal stays visible even when the user is outside the merchant's
    // broadcast radius (that radius only governs push notifications).
    if (userLocation) {
      if (locationFilterEnabled) {
        filtered = filtered.filter((deal) => {
          if (deal.distance === undefined) return false;
          const radius = getDynamicRadius(deal.neighborhoods?.name);
          return deal.distance <= radius;
        });
      }

      // Sort by distance (closest first)
      filtered.sort((a, b) => {
        if (a.distance === undefined) return 1;
        if (b.distance === undefined) return -1;
        return a.distance - b.distance;
      });
    }

    // Apply category filter (manual override)
    if (selectedCategories.length > 0) {
      filtered = filtered.filter((deal) =>
        selectedCategories.includes(deal.deal_type),
      );
    }

    // Apply search filter
    if (debouncedSearchQuery.trim()) {
      const query = debouncedSearchQuery.toLowerCase();
      filtered = filtered.filter(
        (deal) =>
          deal.title.toLowerCase().includes(query) ||
          deal.description.toLowerCase().includes(query) ||
          deal.venue_name.toLowerCase().includes(query) ||
          deal.deal_type.toLowerCase().includes(query),
      );
    }

    setFilteredDeals(filtered);
  };

  const toggleCategory = (category: string) => {
    setSelectedCategories((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category],
    );
  };

  const clearFilters = () => {
    setSelectedCategories([]);
    setSearchQuery("");
  };

  // Deal type, category and end-date all come from the shared presentation
  // layer so /deals rows match JetCards and alert cards exactly.
  const getDealIcon = (deal: Deal) => getDealPresentation(deal).typeEmoji;

  const handleDealClick = (deal: Deal) => {
    setSelectedDeal(deal);
    if (onVenueSelect) {
      // Pass the stable merchant venue id when we have one; the display name
      // is only a fallback for legacy rows without an id.
      onVenueSelect({ id: deal.venue_id, name: deal.venue_name });
    }
  };

  const handleCloseDealCard = () => {
    setSelectedDeal(null);
  };

  // Direct rendering - no loading fallback per architecture/direct-rendering

  return (
    <>
      {/* Deal Detail Sheet - lazy loaded when user clicks a deal */}
      {selectedDeal && (
        <Suspense fallback={null}>
          <Sheet
            open={!!selectedDeal}
            onOpenChange={(open) => !open && handleCloseDealCard()}
          >
            <SheetContent
              side="bottom"
              className="h-auto max-h-[90svh] p-0 rounded-t-2xl overflow-auto"
            >
              <DealDetailCard
                deal={selectedDeal}
                onClose={handleCloseDealCard}
              />
            </SheetContent>
          </Sheet>
        </Suspense>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        {/* Header */}
        <div>
          <TabPageHeader
            title="Explore Deals"
            subtitle={
              userLocation
                ? "Showing deals near you"
                : "Showing all available deals"
            }
          />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              flexWrap: "wrap",
              marginTop: "8px",
            }}
          >
            {(userLocation !== null || locationError !== null) && (
              <Badge
                variant={locationFilterEnabled ? "default" : userLocation ? "secondary" : "outline"}
                role={userLocation ? "button" : undefined}
                tabIndex={userLocation ? 0 : undefined}
                aria-pressed={userLocation ? locationFilterEnabled : undefined}
                title={
                  userLocation
                    ? "Toggle nearby-only filtering. Off shows every active merchant deal."
                    : undefined
                }
                onClick={
                  userLocation
                    ? () => setLocationFilterEnabled(!locationFilterEnabled)
                    : undefined
                }
                onKeyDown={
                  userLocation
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setLocationFilterEnabled(!locationFilterEnabled);
                        }
                      }
                    : undefined
                }
                className={`text-xs flex items-center gap-1 ${
                  userLocation
                    ? `cursor-pointer ${locationFilterEnabled ? "" : "text-emerald-400 border-emerald-400/30"}`
                    : "text-slate-400"
                }`}
              >
                <Navigation className="w-3 h-3" />
                {!userLocation
                  ? "Location Inactive"
                  : locationFilterEnabled
                    ? "Nearby Only"
                    : "Location Active"}
              </Badge>
            )}
            {userPreferences?.categories &&
              userPreferences.categories.length > 0 && (
                <Badge
                  variant={preferenceFilterEnabled ? "default" : "outline"}
                  role="button"
                  tabIndex={0}
                  aria-pressed={preferenceFilterEnabled}
                  className="text-xs flex items-center gap-1 cursor-pointer"
                  onClick={() =>
                    setPreferenceFilterEnabled(!preferenceFilterEnabled)
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setPreferenceFilterEnabled(!preferenceFilterEnabled);
                    }
                  }}
                >
                  <Sparkles className="w-3 h-3" />
                  {preferenceFilterEnabled ? "Personalized" : "Show All"}
                </Badge>
              )}
          </div>
        </div>

        {/* Search Bar */}
        <div style={{ position: "relative" }}>
          <Search
            style={{
              position: "absolute",
              left: "12px",
              top: "50%",
              transform: "translateY(-50%)",
              width: "18px",
              height: "18px",
              color: "hsl(var(--muted-foreground))",
              pointerEvents: "none",
            }}
          />
          <Input
            type="text"
            placeholder="Search venues, deals, or categories..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              paddingLeft: "44px",
              borderRadius: "12px",
              backgroundColor: "hsl(var(--muted) / 0.5)",
              border: "1px solid hsl(var(--border) / 0.4)",
              transition: "all 0.2s",
              textOverflow: "ellipsis",
              overflow: "hidden",
              whiteSpace: "nowrap",
            }}
            aria-label="Search venues, deals, or categories"
          />
        </div>

        {/* Category Filters */}
        {availableCategories.length > 0 && (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "12px" }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <Filter
                  style={{
                    width: "16px",
                    height: "16px",
                    color: "hsl(var(--muted-foreground))",
                  }}
                />
                <span
                  style={{
                    fontSize: "14px",
                    fontWeight: 500,
                    color: "hsl(var(--foreground))",
                  }}
                >
                  Filter by Category
                </span>
              </div>
              {(selectedCategories.length > 0 || searchQuery) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="h-8 text-xs"
                >
                  <X className="w-3 h-3 mr-1" />
                  Clear all
                </Button>
              )}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {availableCategories.map((category) => (
                <Badge
                  key={category}
                  variant={
                    selectedCategories.includes(category)
                      ? "default"
                      : "outline"
                  }
                  className="cursor-pointer hover-scale"
                  onClick={() => toggleCategory(category)}
                >
                  {category}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Stats */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "12px",
          }}
        >
          {[
            {
              icon: TrendingUp,
              value: filteredDeals.length,
              label: userLocation ? "Nearby Deals" : "Active Deals",
              color: "hsl(var(--primary))",
            },
            {
              icon: MapPin,
              value: new Set(filteredDeals.map((d) => d.venue_name)).size,
              label: userLocation ? "Nearby Venues" : "Venues",
              color: "hsl(var(--accent))",
            },
            {
              icon: Clock,
              value: filteredDeals.length,
              label:
                searchQuery || selectedCategories.length > 0
                  ? "Results"
                  : "Available",
              color: "hsl(var(--muted-foreground))",
            },
          ].map((stat, i) => (
            <div
              key={i}
              style={{
                padding: "16px 8px",
                textAlign: "center",
                borderRadius: "14px",
                backgroundColor: "hsl(var(--card) / 0.9)",
                border: "1px solid hsl(var(--border) / 0.5)",
                backdropFilter: "blur(12px)",
              }}
            >
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  margin: "0 auto 8px",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: `linear-gradient(135deg, ${stat.color}26, ${stat.color}0d)`,
                  border: `1px solid ${stat.color}4d`,
                }}
              >
                <stat.icon
                  style={{ width: "20px", height: "20px", color: stat.color }}
                />
              </div>
              <p
                style={{
                  fontSize: "22px",
                  fontWeight: 700,
                  color: "hsl(var(--foreground))",
                }}
              >
                {stat.value}
              </p>
              <p
                style={{
                  fontSize: "11px",
                  color: "hsl(var(--muted-foreground))",
                }}
              >
                {stat.label}
              </p>
            </div>
          ))}
        </div>

        {/* No Results */}
        {!isLoading &&
          filteredDeals.length === 0 &&
          (searchQuery || selectedCategories.length > 0) && (
            <EmptyState
              icon={Search}
              title="No deals found"
              description="Try adjusting your search or filter criteria to find more deals"
              actionLabel="Clear Filters"
              onAction={clearFilters}
            />
          )}

        {/* No Deals at all */}
        {!isLoading &&
          deals.length === 0 &&
          !searchQuery &&
          selectedCategories.length === 0 && (
            <EmptyState
              icon={TrendingUp}
              title="No active deals right now"
              description="Check back soon for new exclusive offers and trending spots in your area"
            />
          )}

        {/* No nearby deals but deals exist elsewhere - show helpful message */}
        {!isLoading &&
          filteredDeals.length === 0 &&
          deals.length > 0 &&
          !searchQuery &&
          selectedCategories.length === 0 && (
            <EmptyState
              icon={MapPin}
              title={locationFilterEnabled ? "No deals nearby" : "No deals match your filters"}
              description={
                locationFilterEnabled
                  ? "Nothing is within your radius right now. Turn off nearby-only to see every active merchant deal."
                  : preferenceFilterEnabled
                    ? "No active deals match your saved preferences. Switch to Show All to see everything."
                    : "No active deals to show right now. Check back soon."
              }
              actionLabel={
                locationFilterEnabled
                  ? "Show all deals"
                  : preferenceFilterEnabled
                    ? "Show all deals"
                    : undefined
              }
              onAction={
                locationFilterEnabled
                  ? () => setLocationFilterEnabled(false)
                  : preferenceFilterEnabled
                    ? () => setPreferenceFilterEnabled(false)
                    : undefined
              }
            />

          )}

        {/* Deals Grid - Uses virtual scrolling for large lists */}
        {!isLoading && filteredDeals.length > 0 && (
          <VirtualList
            items={filteredDeals}
            estimateSize={112}
            overscan={3}
            className="max-h-[60svh]"
            renderItem={(deal) => (
              <Card className="relative overflow-hidden bg-card/90 backdrop-blur-sm hover-scale transition-all shadow-none">
                <div className="flex gap-4 p-4">
                  {/* Image or Icon */}
                  {deal.image_url ? (
                    <OptimizedImage
                      src={deal.image_url}
                      alt={deal.venue_name}
                      className="w-20 h-20 object-cover rounded-lg flex-shrink-0"
                      responsive={true}
                      responsiveSizes={["thumbnail", "small"]}
                      sizesConfig={{
                        mobile: "80px",
                        tablet: "80px",
                        desktop: "80px",
                      }}
                      deferLoad={false}
                      aspectRatio="1/1"
                      fallback={
                        <div className="w-20 h-20 flex items-center justify-center bg-gradient-to-br from-primary/20 via-accent/20 to-secondary/20 rounded-lg flex-shrink-0">
                          <span className="text-3xl">
                            {getDealIcon(deal)}
                          </span>
                        </div>
                      }
                    />
                  ) : (
                    <div className="w-20 h-20 flex items-center justify-center bg-gradient-to-br from-primary/20 via-accent/20 to-secondary/20 rounded-lg flex-shrink-0">
                      <span className="text-3xl">
                        {getDealIcon(deal)}
                      </span>
                    </div>
                  )}

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="text-sm font-bold text-foreground line-clamp-1 min-w-0">
                        {/* Stretched-link pattern: a single real button owns the
                          card's activation so the card itself never becomes a
                          focusable container wrapping other controls. */}
                        <button
                          type="button"
                          onClick={() => handleDealClick(deal)}
                          aria-label={`${deal.title} at ${deal.venue_name}`}
                          className="text-left after:absolute after:inset-0 after:rounded-[inherit] after:content-['']"
                        >
                          {deal.title}
                        </button>
                      </h3>
                      <div className="relative z-10 flex items-center gap-2 flex-shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label={
                            isFavorite(deal.id)
                              ? `Remove ${deal.title} from favorites`
                              : `Add ${deal.title} to favorites`
                          }
                          aria-pressed={isFavorite(deal.id)}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFavorite(deal.id);
                          }}
                        >
                          <Heart
                            className={`w-4 h-4 ${
                              isFavorite(deal.id)
                                ? "fill-primary text-primary"
                                : "text-muted-foreground"
                            }`}
                          />
                        </Button>
                        <DealTypeBadge
                          presentation={getDealPresentation(deal)}
                          size="md"
                        />
                      </div>
                    </div>

                    <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
                      {deal.description}
                    </p>

                    <div className="mb-2">
                      <DealCategoryBadge presentation={getDealPresentation(deal)} />
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <MapPin className="w-3 h-3" />
                        <span className="truncate">{deal.venue_name}</span>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        {deal.distance !== undefined && (
                          <span className="text-accent font-medium">
                            {formatDistance(deal.distance)}
                          </span>
                        )}
                        <DealExpiryBadge presentation={getDealPresentation(deal)} />
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            )}
          />
        )}
      </div>
    </>
  );
};
