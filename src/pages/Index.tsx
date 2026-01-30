import { useState, useEffect, useRef, lazy, Suspense, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { type Venue } from "@/types/venue";
import { CITIES, type City } from "@/types/cities";

// Critical path: Header and BottomNav are always visible
import { BottomNav } from "@/components/BottomNav";
import { Header } from "@/components/Header";


// Hooks must be imported synchronously (React rules)
import { useMapboxToken, getMapboxTokenFromCache } from "@/hooks/useMapboxToken";
import { useDeepLinking } from "@/hooks/useDeepLinking";
import { useSwipeToDismiss } from "@/hooks/useSwipeToDismiss";
import { useIsMobile } from "@/hooks/use-mobile";
import { useVenueImages } from "@/hooks/useVenueImages";
import { useNotifications } from "@/hooks/useNotifications";
import { useAutoScrapeVenueImages } from "@/hooks/useAutoScrapeVenueImages";
import { useDeals } from "@/hooks/useDeals";
import { useVenueActivity } from "@/hooks/useVenueActivity";
import { usePWAInstall } from "@/hooks/usePWAInstall";
import { useBottomNavigation, type NavTab } from "@/hooks/useBottomNavigation";

// Direct import for MapboxHeatmap
import { MapboxHeatmap } from "@/components/MapboxHeatmap";

// Lazy load all secondary components - breaks up critical request chain
const UserProfile = lazy(() => import("@/components/UserProfile").then(m => ({ default: m.UserProfile })));
const ExploreTab = lazy(() => import("@/components/ExploreTab").then(m => ({ default: m.ExploreTab })));
const JetCard = lazy(() => import("@/components/JetCard").then(m => ({ default: m.JetCard })));
const NotificationCard = lazy(() => import("@/components/NotificationCard").then(m => ({ default: m.NotificationCard })));
const DirectionsDialog = lazy(() => import("@/components/DirectionsDialog"));

// Lazy load non-critical UI - deferred until after FCP
const OfflineBanner = lazy(() => import("@/components/OfflineBanner").then(m => ({ default: m.OfflineBanner })));
const PWAInstallPrompt = lazy(() => import("@/components/PWAInstallPrompt").then(m => ({ default: m.PWAInstallPrompt })));
const PushNotificationPrompt = lazy(() => import("@/components/PushNotificationPrompt").then(m => ({ default: m.PushNotificationPrompt })));

// Minimal critical imports
import { Map as MapIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

// Check for cached token synchronously to determine if we can skip loading state
const hasCachedToken = getMapboxTokenFromCache() !== null;

// Top 10 most popular venues in Charlotte, NC metropolitan area with real addresses
const charlotteVenues: Venue[] = [
  { id: "merchant-trade", name: "Merchant & Trade", lat: 35.2271, lng: -80.8393, activity: 95, category: "Rooftop Bar", neighborhood: "Uptown", address: "201 S College St, Charlotte, NC 28202" },
  { id: "punch-room", name: "The Punch Room", lat: 35.2269, lng: -80.8405, activity: 88, category: "Cocktail Bar", neighborhood: "Uptown", address: "100 W Trade St, Charlotte, NC 28202" },
  { id: "heirloom", name: "Heirloom Restaurant", lat: 35.2163, lng: -80.8482, activity: 92, category: "Restaurant", neighborhood: "South End", address: "2000 South Blvd Suite 420, Charlotte, NC 28203" },
  { id: "supperland", name: "Supperland", lat: 35.2381, lng: -80.8237, activity: 87, category: "Restaurant", neighborhood: "Camp North End", address: "1212 N Davidson St, Charlotte, NC 28206" },
  { id: "haberdish", name: "Haberdish", lat: 35.2488, lng: -80.8067, activity: 85, category: "Restaurant", neighborhood: "NoDa", address: "3106 N Davidson St, Charlotte, NC 28205" },
  { id: "seoul-food", name: "Seoul Food Meat Company", lat: 35.2188, lng: -80.8441, activity: 83, category: "Restaurant", neighborhood: "South End", address: "2001 South Blvd, Charlotte, NC 28203" },
  { id: "crunkleton", name: "The Crunkleton", lat: 35.2193, lng: -80.8137, activity: 80, category: "Cocktail Bar", neighborhood: "Plaza Midwood", address: "1957 E 7th St, Charlotte, NC 28204" },
  { id: "fahrenheit", name: "Fahrenheit", lat: 35.2272, lng: -80.8394, activity: 90, category: "Restaurant", neighborhood: "Uptown", address: "222 S Caldwell St, Charlotte, NC 28202" },
  { id: "angelines", name: "Angeline's", lat: 35.2257, lng: -80.8401, activity: 82, category: "Restaurant", neighborhood: "Uptown", address: "125 W Trade St, Charlotte, NC 28202" },
  { id: "wooden-robot", name: "Wooden Robot Brewery", lat: 35.2156, lng: -80.8485, activity: 78, category: "Brewery", neighborhood: "South End", address: "1440 S Tryon St Suite 110, Charlotte, NC 28203" },
];

const Index = () => {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Use shared navigation hook for consistent tab handling
  const { activeTab, setActiveTab, handleTabChange } = useBottomNavigation({ defaultTab: "map" });
  // Defer Mapbox loading until browser is idle to reduce TBT while keeping map as primary
  const [isMapboxReady, setIsMapboxReady] = useState(false);
  const [mapUIResetKey, setMapUIResetKey] = useState(0); // Increments when switching to map tab to reset collapsed UI
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [selectedCity, setSelectedCity] = useState<City>(CITIES[0]); // Default to Charlotte
  const [detectedLocationName, setDetectedLocationName] = useState<string | null>(null); // Actual city from reverse geocoding
  const [showDirectionsDialog, setShowDirectionsDialog] = useState(false);
  const [deepLinkedDeal, setDeepLinkedDeal] = useState<any>(null);
  const { token: mapboxToken, loading: mapboxLoading, error: mapboxError } = useMapboxToken();
  const { getVenueImage } = useVenueImages();
  
  // Data hooks - load immediately without deferral
  const { notifications, loading: notificationsLoading, markAsRead } = useNotifications(true);
  const { isScrapingActive } = useAutoScrapeVenueImages(true);
  const { deals, refresh: refreshDeals, loading: dealsLoading, lastUpdated: dealsLastUpdated } = useDeals(false, true);
  const { venues: realVenues, loading: venuesLoading, refresh: refreshVenues, lastUpdated: venuesLastUpdated } = useVenueActivity(true);
  const { justInstalled, clearJustInstalled } = usePWAInstall();
  const [showPushPrompt, setShowPushPrompt] = useState(false);
  const jetCardRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  
  // Swipe to dismiss for JetCard on mobile
  const { handlers: swipeHandlers, style: swipeStyle } = useSwipeToDismiss({
    onDismiss: () => setSelectedVenue(null),
    threshold: 80,
    direction: 'down'
  });

  // Use real venues when available, fallback to Charlotte venues
  const venues = realVenues && realVenues.length > 0 ? realVenues : charlotteVenues;

  // Handle deep linked deal - select the venue associated with the deal
  const handleDeepLinkDeal = useCallback(async (dealId: string, dealData: any) => {
    setDeepLinkedDeal(dealData);
    setActiveTab("map");
    
    // Find or create venue data from the deal
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

    // Try to find the venue in our venue list for better coordinates
    const existingVenue = venues.find(v => 
      v.name.toLowerCase() === dealData.venue_name.toLowerCase()
    );

    if (existingVenue) {
      setSelectedVenue({
        ...existingVenue,
        imageUrl: dealData.image_url || getVenueImage(existingVenue.name) || existingVenue.imageUrl,
        address: dealData.venue_address || existingVenue.address
      });
    } else {
      setSelectedVenue(venueFromDeal);
    }

    // Scroll to JetCard
    setTimeout(() => {
      jetCardRef.current?.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'start' 
      });
    }, 300);
  }, [venues, selectedCity, getVenueImage]);

  // Handle deep linked venue
  const handleDeepLinkVenue = useCallback((venueName: string) => {
    setActiveTab("map");
    const venue = venues.find(v => 
      v.name.toLowerCase() === venueName.toLowerCase()
    );
    
    if (venue) {
      const venueWithImage = {
        ...venue,
        imageUrl: getVenueImage(venue.name) || venue.imageUrl,
      };
      setSelectedVenue(venueWithImage);
      
      setTimeout(() => {
        jetCardRef.current?.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start' 
        });
      }, 300);
    }
  }, [venues, getVenueImage]);

  // Initialize deep linking
  useDeepLinking({
    onDealOpen: handleDeepLinkDeal,
    onVenueOpen: handleDeepLinkVenue,
  });



  // Check onboarding status - only redirect to onboarding if needed, never sign out
  useEffect(() => {
    const checkOnboarding = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("onboarding_completed")
          .eq("id", session.user.id)
          .single();
        
        if (profile && !profile.onboarding_completed) {
          navigate("/onboarding");
        }
      }
    };
    
    checkOnboarding();
  }, [navigate]);

  // URL sync is now handled by useBottomNavigation hook

  // Reset map UI collapsed state when switching to map tab
  useEffect(() => {
    if (activeTab === "map") {
      setMapUIResetKey(prev => prev + 1);
    }
  }, [activeTab]);

  // Defer Mapbox initialization until after initial paint to reduce TBT
  useEffect(() => {
    if (activeTab === "map" && !isMapboxReady) {
      // Use requestIdleCallback with 500ms timeout to push loading after LCP
      const scheduleMapboxLoad = () => {
        if ('requestIdleCallback' in window) {
          (window as any).requestIdleCallback(() => {
            setIsMapboxReady(true);
          }, { timeout: 800 }); // 800ms delay to allow LCP to complete
        } else {
          // Fallback for Safari - use setTimeout after paint
          requestAnimationFrame(() => {
            setTimeout(() => setIsMapboxReady(true), 100);
          });
        }
      };
      scheduleMapboxLoad();
    }
  }, [activeTab, isMapboxReady]);

  const handleCityChange = useCallback((city: City) => {
    setSelectedCity(city);
    toast.success(`Switched to ${city.name}, ${city.state}`, {
      description: "Finding deals in your area"
    });
  }, []);

  // Auto-select nearest city when geolocation detects it on initial load
  const handleNearestCityDetected = useCallback((city: City) => {
    setSelectedCity(city);
  }, []);

  // Handle detected location name from reverse geocoding
  const handleDetectedLocationNameChange = useCallback((name: string | null) => {
    setDetectedLocationName(name);
  }, []);

  const handleVenueSelect = useCallback(async (venue: Venue | string) => {
    // Handle both Venue object and venue name string
    if (typeof venue === 'string') {
      // Find the venue by name in real venues or mock venues
      const foundVenue = venues.find(v => v.name === venue);
      if (foundVenue) {
        // Fetch address from deals table
        const { data: dealData } = await supabase
          .from('deals')
          .select('venue_address')
          .eq('venue_name', foundVenue.name)
          .limit(1)
          .maybeSingle();
        
        const venueWithImage = {
          ...foundVenue,
          imageUrl: getVenueImage(foundVenue.name) || foundVenue.imageUrl,
          address: dealData?.venue_address || undefined
        };
        setSelectedVenue(venueWithImage);
        setActiveTab('map'); // Switch to map tab
        toast.success(`Selected ${foundVenue.name}`, {
          description: `${foundVenue.activity}% active in ${foundVenue.neighborhood}`
        });
        
        // Scroll to JetCard
        setTimeout(() => {
          jetCardRef.current?.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'start' 
          });
        }, 100);
      }
    } else {
      // Fetch address from deals table for venue object
      const { data: dealData } = await supabase
        .from('deals')
        .select('venue_address')
        .eq('venue_name', venue.name)
        .limit(1)
        .maybeSingle();
      
      // Original venue object handling
      const venueWithImage = {
        ...venue,
        imageUrl: getVenueImage(venue.name) || venue.imageUrl,
        address: dealData?.venue_address || venue.address
      };
      setSelectedVenue(venueWithImage);
      toast.success(`Selected ${venue.name}`, {
        description: `${venue.activity}% active in ${venue.neighborhood}`
      });
      
      // Scroll to JetCard
      setTimeout(() => {
        jetCardRef.current?.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start' 
        });
      }, 100);
    }
  }, [venues, getVenueImage]);

  const handleGetDirections = useCallback(async () => {
    if (!selectedVenue) return;
    // Dynamic import for haptics to reduce bundle
    try {
      const { glideHaptic } = await import("@/lib/haptics");
      await glideHaptic();
    } catch {
      // Haptics not available
    }
    setShowDirectionsDialog(true);
  }, [selectedVenue]);

  return (
    <div 
      className="flex flex-col w-full h-full"
      style={{
        flex: '1 1 0%',
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      {/* Header - renders directly per direct-rendering-no-fallbacks architecture */}
        <Header 
          venues={venues}
          deals={deals}
          onVenueSelect={handleVenueSelect}
          isLoading={dealsLoading || venuesLoading}
          lastUpdated={dealsLastUpdated || venuesLastUpdated}
          onRefresh={() => {
            refreshDeals();
            refreshVenues();
          }}
          cityName={detectedLocationName || `${selectedCity.name}, ${selectedCity.state}`}
        />

        {/* Offline Banner - lazy loaded, non-critical */}
        <Suspense fallback={null}>
          <OfflineBanner />
        </Suspense>

      {/* Main Content - FIXED height using CSS variables, positioned BETWEEN header and bottom nav */}
      <main 
        role="main"
        id="main-content"
        className={`page-fade-in ${activeTab === 'map' ? 'w-full' : 'max-w-7xl mx-auto px-fluid-sm sm:px-fluid-md md:px-fluid-lg py-fluid-sm sm:py-fluid-md overflow-y-auto'}`}
        style={{ 
          // FIXED dimensions - strictly between header and bottom nav
          flex: '1 1 auto',
          height: 'var(--main-height)',
          minHeight: 'var(--main-height)',
          maxHeight: 'var(--main-height)',
          // Strict containment prevents map from escaping bounds
          contain: 'strict',
          // GPU layer for smooth transitions
          transform: 'translateZ(0)',
          boxSizing: 'border-box',
          width: '100%',
          // Stacking context - main content is between header (z-60) and bottom nav (z-50)
          zIndex: 1,
          position: 'relative',
          overflow: activeTab === 'map' ? 'hidden' : 'auto',
        }}
      >
        {activeTab === "map" && (
          <div 
            className="relative w-full h-full"
            style={{ 
              // Map container is strictly bounded within main content - never overlays nav
              position: 'absolute',
              inset: 0,
              height: '100%',
              width: '100%',
              contain: 'strict',
              transform: 'translateZ(0)',
              overflow: 'hidden',
              // Ensure map stays below header/nav z-index
              zIndex: 0,
            }}
          >

            {/* Mapbox Heatmap - Strictly contained within main area */}
            <div 
              className="relative"
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                contain: 'strict',
                // Map content layer - below all overlays
                zIndex: 1,
              }}
            >
              {/* Error state - only show if there's a definite error */}
              {mapboxError && !mapboxLoading && (
                <div 
                  className="absolute inset-0 z-10 flex items-center justify-center bg-background"
                >
                  <div className="text-center space-y-3 sm:space-y-4 p-6 sm:p-8">
                    <div className="w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20 mx-auto rounded-full bg-destructive/10 flex items-center justify-center">
                      <MapIcon className="w-6 h-6 sm:w-8 sm:h-8 md:w-10 md:h-10 text-destructive" />
                    </div>
                    <div className="space-y-1.5 sm:space-y-2">
                      <p className="text-sm sm:text-base md:text-lg font-medium text-foreground">Unable to load map</p>
                      <p className="text-xs sm:text-sm text-muted-foreground max-w-[200px] sm:max-w-[280px] mx-auto">{mapboxError}</p>
                    </div>
                    <Button 
                      variant="outline" 
                      size="default"
                      onClick={() => window.location.reload()}
                      className="mt-2 sm:mt-3"
                    >
                      Try Again
                    </Button>
                  </div>
                </div>
              )}
              
              {/* Map - renders immediately per architecture/mapbox-rendering-immediate-no-conditional-loading */}
              <div 
                className="h-full w-full"
                style={{
                  opacity: isMapboxReady && mapboxToken ? 1 : 0,
                  transition: 'opacity 300ms ease-out',
                }}
              >
                {mapboxToken && (
                  <MapboxHeatmap
                    onVenueSelect={handleVenueSelect} 
                    venues={venues} 
                    mapboxToken={mapboxToken}
                    selectedCity={selectedCity}
                    onCityChange={handleCityChange}
                    onNearestCityDetected={handleNearestCityDetected}
                    onDetectedLocationNameChange={handleDetectedLocationNameChange}
                    isLoadingVenues={venuesLoading}
                    selectedVenue={selectedVenue}
                    resetUIKey={mapUIResetKey}
                    isTokenLoading={false}
                  />
                )}
              </div>
            </div>

            {/* Selected Venue Card - Positioned above bottom nav */}
            {selectedVenue && (
              <div 
                ref={jetCardRef} 
                className="fixed z-[60] animate-fade-in"
                style={{
                  bottom: 'var(--map-fixed-bottom)',
                  left: 'var(--map-ui-inset-left)',
                  right: 'var(--map-ui-inset-right)',
                  maxWidth: '480px',
                  marginLeft: 'auto',
                  marginRight: 'auto',
                  pointerEvents: 'none',
                  ...(isMobile ? swipeStyle : {}),
                }}
                {...(isMobile ? swipeHandlers : {})}
              >
                <div className="pointer-events-auto">
                  {/* Swipe indicator for mobile */}
                  {isMobile && (
                    <div className="flex justify-center pb-2 sm:pb-2.5">
                      <div className="w-10 h-1 bg-muted-foreground/40 rounded-full" />
                    </div>
                  )}
                  <Suspense fallback={<div className="h-32 bg-muted/50 rounded-xl" />}>
                    <JetCard 
                      venue={selectedVenue} 
                      onGetDirections={handleGetDirections}
                      onClose={() => setSelectedVenue(null)}
                    />
                  </Suspense>
                </div>
              </div>
            )}

          </div>
        )}

         {activeTab === "notifications" && (
          <div className="gap-fluid-md animate-fade-in px-fluid-md py-fluid-md">
            <div>
              <h2 className="text-fluid-2xl font-bold text-foreground mb-1 sm:mb-2">Notifications</h2>
              <p className="text-fluid-sm text-muted-foreground">Stay updated with nearby deals and events</p>
            </div>
            
            {notifications.length === 0 ? (
              <div className="text-center py-8 sm:py-10 md:py-12 text-muted-foreground">
                <p className="text-sm sm:text-base">No notifications yet</p>
                <p className="text-xs sm:text-sm mt-1 sm:mt-2">Enable location tracking to receive deal alerts</p>
              </div>
            ) : (
              <Suspense fallback={<div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 bg-muted/50 rounded-lg" />)}</div>}>
                {notifications.map((notification) => (
                  <div 
                    key={notification.id}
                  >
                    <NotificationCard 
                      notification={notification} 
                      onVenueClick={handleVenueSelect}
                      onRead={() => markAsRead(notification.id)}
                    />
                  </div>
                ))}
              </Suspense>
            )}
          </div>
        )}

        {activeTab === "explore" && (
          <div className="px-fluid-md py-fluid-md">
            <Suspense fallback={null}>
              <ExploreTab onVenueSelect={handleVenueSelect} />
            </Suspense>
          </div>
        )}
      </main>

      {/* Bottom Navigation - Show skeleton during initial load */}
      <BottomNav 
        activeTab={activeTab} 
        onTabChange={handleTabChange}
        onPrefetch={(tab) => {
          // Prefetch Mapbox chunk on hover/touch of map tab
          if (tab === "map" && !isMapboxReady) {
            import("@/components/MapboxHeatmap");
          }
        }}
        notificationCount={notifications.filter(n => !n.read).length}
      />

      {/* Directions Dialog - Lazy loaded */}
      <Suspense fallback={null}>
        <DirectionsDialog
          open={showDirectionsDialog}
          onOpenChange={setShowDirectionsDialog}
          venue={selectedVenue}
        />
      </Suspense>

      {/* PWA Install Prompt - lazy loaded */}
      <Suspense fallback={null}>
        <PWAInstallPrompt />
      </Suspense>

      {/* Push Notification Prompt - shows after PWA install */}
      <Suspense fallback={null}>
        <PushNotificationPrompt 
          show={justInstalled || showPushPrompt}
          onDismiss={() => {
            clearJustInstalled();
            setShowPushPrompt(false);
          }}
        />
      </Suspense>
    </div>
  );
};

export default Index;
