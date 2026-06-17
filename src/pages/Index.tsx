import { useState, useEffect, useRef, lazy, Suspense, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useSearchParams } from "react-router";
import { supabase } from "@/integrations/supabase/client";
import { type Venue } from "@/types/venue";
import { CITIES, type City } from "@/types/cities";

// Critical path: BottomNav is always visible
import { BottomNav } from "@/components/BottomNav";
import { useHeaderConfig } from "@/contexts/HeaderContext";


// Hooks must be imported synchronously (React rules)
import { useMapboxToken } from "@/hooks/useMapboxToken";
import { useDeepLinking } from "@/hooks/useDeepLinking";
import { useSwipeToDismiss } from "@/hooks/useSwipeToDismiss";
import { useIsMobile } from "@/hooks/use-mobile";
import { useVenueImages } from "@/hooks/useVenueImages";
import { useNotifications } from "@/hooks/useNotifications";
import { useAutoScrapeVenueImages } from "@/hooks/useAutoScrapeVenueImages";
import { useDeals } from "@/hooks/useDeals";
import { useVenueActivity } from "@/hooks/useVenueActivity";
import { usePWAInstall } from "@/hooks/usePWAInstall";
import { useBottomNavigation } from "@/hooks/useBottomNavigation";
import { NotificationsTabSkeleton, ExploreTabSkeleton } from "@/components/skeletons/PageSkeletons";
import { TabPageHeader } from "@/components/TabPageHeader";
import { PageShell } from "@/components/PageShell";
import { SEO } from "@/components/SEO";
import { CityTransitionOverlay } from "@/components/CityTransitionOverlay";
import { useAuth } from "@/contexts/AuthContext";
import {
  readCachedOnboardingStatus,
  writeCachedOnboardingStatus,
} from "@/lib/onboardingStatus";

// Lazy load heavy components - deferred until needed
const MapboxHeatmap = lazy(() => import("@/components/MapboxHeatmap").then(m => ({ default: m.MapboxHeatmap })));

// Lazy load interaction-triggered components - not needed for first paint
const JetCard = lazy(() => import("@/components/JetCard").then(m => ({ default: m.JetCard })));
import { JetCardSkeleton } from "@/components/skeletons/JetCardSkeleton";
const ParkingCard = lazy(() => import("@/components/ParkingCard").then(m => ({ default: m.ParkingCard })));
const NotificationCard = lazy(() => import("@/components/NotificationCard").then(m => ({ default: m.NotificationCard })));

// Lazy load tab content and dialogs - user-triggered
const ExploreTab = lazy(() => import("@/components/ExploreTab").then(m => ({ default: m.ExploreTab })));
const DirectionsDialog = lazy(() => import("@/components/DirectionsDialog"));
const ShareToFriendDialog = lazy(() => import("@/components/ShareToFriendDialog").then(m => ({ default: m.ShareToFriendDialog })));

// Lazy load non-critical UI - deferred until after FCP
const OfflineBanner = lazy(() => import("@/components/OfflineBanner").then(m => ({ default: m.OfflineBanner })));
const AuthPWAInstallPromptWrapper = lazy(() => import("@/components/AuthPWAInstallPromptWrapper").then(m => ({ default: m.AuthPWAInstallPromptWrapper })));
const PushNotificationPrompt = lazy(() => import("@/components/PushNotificationPrompt").then(m => ({ default: m.PushNotificationPrompt })));

// Minimal critical imports
import { Map as MapIcon, Bell } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const Index = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { session, isLoading: authLoading } = useAuth();
  
  // Use shared navigation hook for consistent tab handling
  const { activeTab, setActiveTab, handleTabChange } = useBottomNavigation({ defaultTab: "map" });
  const [mapUIResetKey, setMapUIResetKey] = useState(0); // Increments when switching to map tab to reset collapsed UI
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);

  // Funnel: fire "Deal Viewed" once per JetCard open (transition null→venue).
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
  const [selectedParking, setSelectedParking] = useState<{ lat: number; lng: number; name?: string } | null>(null);
  // Persisted city — initialized synchronously from localStorage so the first
  // paint already shows the user's last city (no flash of Charlotte default).
  const [selectedCity, setSelectedCity] = useState<City>(() => {
    try {
      const savedId = typeof window !== 'undefined'
        ? window.localStorage.getItem('jet-map-selected-city')
        : null;
      const match = savedId ? CITIES.find((c) => c.id === savedId) : undefined;
      return match ?? CITIES[0]; // Default to Charlotte
    } catch {
      return CITIES[0];
    }
  });

  // Persist selectedCity changes for the next session.
  useEffect(() => {
    try {
      window.localStorage.setItem('jet-map-selected-city', selectedCity.id);
    } catch {
      /* storage disabled — ignore */
    }
  }, [selectedCity]);
  const [detectedLocationName, setDetectedLocationName] = useState<string | null>(null); // Actual city from reverse geocoding
  const [showDirectionsDialog, setShowDirectionsDialog] = useState(false);
  const [showSendDialog, setShowSendDialog] = useState(false);
  const [sendDialogUserId, setSendDialogUserId] = useState<string | null>(null);
  const [, setDeepLinkedDeal] = useState<any>(null);
  const { token: mapboxToken, loading: mapboxLoading, error: mapboxError } = useMapboxToken();
  const { getVenueImage } = useVenueImages();

  // Idle-defer non-critical data hooks so they don't block LCP / inflate TBT
  // on the landing route. These fire after the map paints (or after ~1.5s
  // fallback), shaving ~800ms off Total Blocking Time on mobile.
  const [dataReady, setDataReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const trigger = () => { if (!cancelled) setDataReady(true); };
    const ric = (window as any).requestIdleCallback as
      | ((cb: () => void, opts?: { timeout: number }) => number)
      | undefined;
    const id = ric
      ? ric(trigger, { timeout: 1500 })
      : (window.setTimeout(trigger, 600) as unknown as number);
    return () => {
      cancelled = true;
      if (ric && (window as any).cancelIdleCallback) {
        (window as any).cancelIdleCallback(id);
      } else {
        window.clearTimeout(id);
      }
    };
  }, []);

  const { notifications, markAsRead } = useNotifications(dataReady);
  useAutoScrapeVenueImages(dataReady);
  const { deals, refresh: refreshDeals, loading: dealsLoading, lastUpdated: dealsLastUpdated } = useDeals(false, dataReady);
  const { venues: realVenues, loading: venuesLoading, refresh: refreshVenues, lastUpdated: venuesLastUpdated } = useVenueActivity(dataReady);
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

  // Venues come exclusively from the live merchant-driven dataset. Hardcoded
  // city fallbacks were removed (they polluted non-Charlotte cities and
  // violated the merchant-only content rule). Dedupe by id defensively.
  const venues = useMemo(() => {
    if (!realVenues || realVenues.length === 0) return [];
    const map = new Map<string, Venue>();
    for (const v of realVenues) map.set(v.id, v);
    return Array.from(map.values());
  }, [realVenues]);

  // Two-way sync: selectedVenue ⇄ `?venue=<id>` URL param so the open
  // JetCard survives reloads and is shareable. The param is a stable
  // venue id (legacy name-based links still resolve via fallback).
  // Restoration happens once venues are loaded; clearing the venue
  // strips the param.
  const venueRestoredRef = useRef(false);
  useEffect(() => {
    if (venueRestoredRef.current) return;
    if (!venues.length) return;
    const venueParam = searchParams.get("venue");
    if (!venueParam) {
      venueRestoredRef.current = true;
      return;
    }
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
    } else {
      // Unknown venue id/name in the URL — surface a toast and strip the
      // stale param so a reload doesn't keep retrying the miss.
      toast.error("Venue not found", {
        description: "That venue link is no longer available.",
      });
      const next = new URLSearchParams(searchParams);
      next.delete("venue");
      setSearchParams(next, { replace: true });
    }
    venueRestoredRef.current = true;
  }, [venues, searchParams, setSearchParams, getVenueImage]);

  useEffect(() => {
    // Don't write the URL until the initial restoration pass has run, or we
    // could blow away a deep-linked `?venue=` before it's read.
    if (!venueRestoredRef.current) return;
    const currentParam = searchParams.get("venue");
    const nextParam = selectedVenue ? encodeURIComponent(selectedVenue.id) : null;
    if (currentParam === nextParam) return;
    const next = new URLSearchParams(searchParams);
    if (nextParam) next.set("venue", nextParam);
    else next.delete("venue");
    // Push a new history entry on the "open" transition (no venue → venue)
    // so the browser Back button closes the JetCard while preserving any
    // active `?q=` search query in the URL. Use replace for venue swaps and
    // for closing the card, so we don't pollute history.
    const isOpening = !currentParam && !!nextParam;
    setSearchParams(next, { replace: !isOpening });
  }, [selectedVenue, searchParams, setSearchParams]);

  // Handle deep linked deal - select the venue associated with the deal
  const handleDeepLinkDeal = useCallback(async (_dealId: string, dealData: any) => {
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

  // Handle deep linked venue. Accepts a stable venue id (preferred) or a
  // legacy venue name for backward compatibility with old shared links.
  const handleDeepLinkVenue = useCallback((venueIdOrName: string) => {
    setActiveTab("map");
    const lower = venueIdOrName.toLowerCase();
    const venue =
      venues.find((v) => v.id === venueIdOrName) ??
      venues.find((v) => v.name.toLowerCase() === lower);
    
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



  // Check onboarding status — only redirect when we *know* the user
  // hasn't completed it. Uses AuthContext's already-resolved session
  // (no extra getSession round-trip) and a per-user sessionStorage
  // cache so we don't re-query profiles on every mount. This kills
  // the `/` ⇄ `/onboarding` redirect bounce that caused the flash.
  useEffect(() => {
    if (authLoading) return;
    if (!session) return; // unauthenticated visitors can browse `/`

    const uid = session.user.id;
    const cached = readCachedOnboardingStatus(uid);
    if (cached === true) return; // already done, no redirect
    if (cached === false) {
      navigate("/onboarding", { replace: true });
      return;
    }

    let cancelled = false;
    (async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("onboarding_completed")
        .eq("id", uid)
        .single();
      if (cancelled || !profile) return;
      writeCachedOnboardingStatus(uid, !!profile.onboarding_completed);
      if (!profile.onboarding_completed) {
        navigate("/onboarding", { replace: true });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, session, navigate]);

  // URL sync is now handled by useBottomNavigation hook

  // Reset map UI collapsed state when switching to map tab
  useEffect(() => {
    if (activeTab === "map") {
      setMapUIResetKey(prev => prev + 1);
    }
  }, [activeTab]);

  // Direct rendering - no deferral needed for Mapbox initialization
  // (requestIdleCallback delays removed per direct-rendering architecture)

  const handleCityChange = useCallback((city: City) => {
    setSelectedCity(city);
    setCityTransitionNonce((n) => n + 1);
    toast.success(`Switched to ${city.name}, ${city.state}`, {
      description: "Finding deals in your area"
    });
  }, []);

  // Auto-select nearest city when geolocation detects it on initial load
  const handleNearestCityDetected = useCallback((city: City) => {
    setSelectedCity(city);
    setCityTransitionNonce((n) => n + 1);
  }, []);

  // Handle detected location name from reverse geocoding
  const handleDetectedLocationNameChange = useCallback((name: string | null) => {
    setDetectedLocationName(name);
  }, []);

  const handleVenueSelect = useCallback((venue: Venue | string) => {
    if (typeof venue === 'string') {
      const foundVenue = venues.find(v => v.name === venue);
      if (foundVenue) {
        const venueWithImage = {
          ...foundVenue,
          imageUrl: getVenueImage(foundVenue.name) || foundVenue.imageUrl,
        };
        setSelectedVenue(venueWithImage);
        setActiveTab('map');
        toast.success(`Selected ${foundVenue.name}`, {
          description: `${foundVenue.activity}% active in ${foundVenue.neighborhood}`
        });
      }
    } else {
      const venueWithImage = {
        ...venue,
        imageUrl: getVenueImage(venue.name) || venue.imageUrl,
      };
      setSelectedVenue(venueWithImage);
      // Always surface the JetCard on the map so the marker context lines up
      // with the card (and the card isn't obscured by other tabs' chrome).
      setActiveTab('map');
      toast.success(`Selected ${venue.name}`, {
        description: `${venue.activity}% active in ${venue.neighborhood}`
      });
    }
  }, [venues, getVenueImage, setActiveTab]);

  const handleParkingSelect = useCallback((parking: { lat: number; lng: number; name?: string }) => {
    setSelectedVenue(null); // Close venue card if open
    setSelectedParking(parking);
  }, []);

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

  // Set header config via context so the global Header gets Index-specific data
  const setHeaderConfig = useHeaderConfig();
  const refreshBoth = useCallback(() => {
    refreshDeals();
    refreshVenues();
  }, [refreshDeals, refreshVenues]);
  const cityName = detectedLocationName || `${selectedCity.name}, ${selectedCity.state}`;

  // Use refs for callbacks to avoid infinite loop: setHeaderConfig detects
  // new function references as "changes", triggering re-render, which creates
  // new refs, which triggers setHeaderConfig again.
  const handleVenueSelectRef = useRef(handleVenueSelect);
  handleVenueSelectRef.current = handleVenueSelect;
  const refreshBothRef = useRef(refreshBoth);
  refreshBothRef.current = refreshBoth;

  // Stable wrappers that never change identity
  const stableOnVenueSelect = useMemo(() => ((v: Venue | string) => handleVenueSelectRef.current(v)) as (v: Venue | string) => void, []);
  const stableOnRefresh = useMemo(() => (() => refreshBothRef.current()), []);

  useEffect(() => {
    setHeaderConfig({
      venues,
      deals,
      onVenueSelect: stableOnVenueSelect,
      isLoading: dealsLoading || venuesLoading,
      lastUpdated: dealsLastUpdated || venuesLastUpdated,
      onRefresh: stableOnRefresh,
      cityName,
      hideSearch: false,
    });
  }, [setHeaderConfig, venues, deals, stableOnVenueSelect, dealsLoading, venuesLoading, dealsLastUpdated, venuesLastUpdated, stableOnRefresh, cityName]);

  return (
    <div 
      className="relative w-full"
      style={{
        flex: '1 1 0%',
        minHeight: 0,
        isolation: 'isolate',
        position: 'relative',
      }}
    >
      <SEO
        title="JET — Find Live Deals & Events Near You in Charlotte"
        description="Discover trending venues, live events, and exclusive happy-hour deals across Charlotte on a real-time heatmap. Your guide to what's hot right now."
        path="/"
      />
      {/* FULL-SCREEN MAP LAYER - only on map tab */}
      {activeTab === "map" && (
        <>
          <div 
            className="absolute inset-0 w-full h-full"
            style={{ zIndex: 0 }}
          >
            {mapboxError && !mapboxLoading && (
              <div style={{
                position: 'absolute', inset: 0, zIndex: 10,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'hsl(var(--background))',
              }}>
                <div style={{ textAlign: 'center', padding: '24px' }}>
                  <div style={{
                    width: '56px', height: '56px', margin: '0 auto',
                    borderRadius: '50%', background: 'hsl(var(--destructive) / 0.1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <MapIcon style={{ width: '28px', height: '28px', color: 'hsl(var(--destructive))' }} />
                  </div>
                  <div style={{ marginTop: '12px' }}>
                    <p style={{ fontSize: '14px', fontWeight: 500, color: 'hsl(var(--foreground))' }}>Unable to load map</p>
                    <p style={{ fontSize: '12px', color: 'hsl(var(--muted-foreground))', maxWidth: '280px', margin: '4px auto 0' }}>{mapboxError}</p>
                  </div>
                  <Button 
                    variant="outline" 
                    size="default"
                    onClick={() => window.location.reload()}
                    style={{ marginTop: '12px' }}
                  >
                    Try Again
                  </Button>
                </div>
              </div>
            )}
            
            <div 
              className="absolute inset-0 w-full h-full"
            >
              {mapboxToken && (
                <Suspense fallback={null}>
                  <MapboxHeatmap
                    onVenueSelect={handleVenueSelect}
                    onParkingSelect={handleParkingSelect}
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
                </Suspense>
              )}
            </div>
          </div>

        </>
      )}

      {/* JetCard - portaled to body to bypass stacking contexts */}
      {selectedVenue && activeTab === "map" && createPortal(
        <div 
          ref={jetCardRef} 
          className="animate-fade-in"
          style={{
            position: 'fixed',
            bottom: 'calc(var(--bottom-nav-total-height, 60px) + 8px)',
            left: '0',
            width: '100vw',
            zIndex: 9999,
            padding: '0 12px',
            boxSizing: 'border-box',
            pointerEvents: 'none',
            ...(isMobile ? swipeStyle : {}),
          }}
          {...(isMobile ? swipeHandlers : {})}
        >
          <div style={{ pointerEvents: 'auto', width: '100%', maxWidth: '480px', margin: '0 auto', boxSizing: 'border-box' }}>
            {isMobile && (
              <div className="flex justify-center pb-2 sm:pb-2.5">
                <div className="w-10 h-1 bg-muted-foreground/40 rounded-full" />
              </div>
            )}
            <Suspense fallback={<JetCardSkeleton />}>
              <JetCard 
                venue={selectedVenue} 
                onGetDirections={handleGetDirections}
                onClose={() => setSelectedVenue(null)}
                onSendToFriend={async () => {
                  const { data: { session } } = await supabase.auth.getSession();
                  if (!session?.user) {
                    toast.error("Sign in to send venues to friends");
                    return;
                  }
                  setSendDialogUserId(session.user.id);
                  setShowSendDialog(true);
                }}
              />
            </Suspense>
          </div>
        </div>,
        document.body
      )}

      {/* ParkingCard - portaled to body like JetCard */}
      {selectedParking && activeTab === "map" && createPortal(
        <div 
          className="animate-fade-in"
          style={{
            position: 'fixed',
            bottom: 'calc(var(--bottom-nav-total-height, 60px) + 8px)',
            left: '0',
            width: '100vw',
            zIndex: 9999,
            padding: '0 12px',
            boxSizing: 'border-box',
            pointerEvents: 'none',
          }}
        >
          <div style={{ pointerEvents: 'auto', width: '100%', maxWidth: '480px', margin: '0 auto', boxSizing: 'border-box' }}>
            {isMobile && (
              <div className="flex justify-center pb-2 sm:pb-2.5">
                <div className="w-10 h-1 bg-muted-foreground/40 rounded-full" />
              </div>
            )}
            <Suspense fallback={null}>
              <ParkingCard
                lat={selectedParking.lat}
                lng={selectedParking.lng}
                name={selectedParking.name}
                onClose={() => setSelectedParking(null)}
              />
            </Suspense>
          </div>
        </div>,
        document.body
      )}

      {/* Header config is set via context (useEffect below) */}

      {/* Offline Banner - lazy loaded, non-critical */}
      <Suspense fallback={null}>
        <OfflineBanner />
      </Suspense>

      {/* Main Content Area - For non-map tabs, overlaid on map background */}
      {activeTab !== "map" && (
        <main 
          role="main"
          id="main-content"
          className="page-fade-in page-container max-w-7xl mx-auto bg-gradient-to-b from-background via-background to-muted/30 dot-grid-pattern"
          style={{ 
            /* No marginTop needed - App.tsx spacer already reserves header space */
            height: 'var(--main-height)',
            minHeight: 'var(--main-height)',
            maxHeight: 'var(--main-height)',
            contain: 'style',
            boxSizing: 'border-box',
            width: '100%',
            zIndex: 1,
            position: 'relative',
            overflow: 'auto',
          }}
        >
          {activeTab === "notifications" && (
            <Suspense fallback={<NotificationsTabSkeleton />}>
            <PageShell>
              <TabPageHeader
                title="Notifications"
                subtitle="Stay updated with nearby deals and events"
              />
              
              {notifications.length === 0 ? (
                <div style={{
                  textAlign: 'center', padding: '48px 16px',
                  borderRadius: '16px',
                  background: 'hsl(var(--card) / 0.9)',
                  border: '1px solid hsl(var(--border) / 0.5)',
                }}>
                  <div style={{
                    width: '56px', height: '56px', margin: '0 auto 16px',
                    borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'linear-gradient(135deg, hsl(var(--primary) / 0.15), hsl(var(--accent) / 0.15))',
                    border: '1px solid hsl(var(--primary) / 0.2)',
                  }}>
                    <Bell style={{ width: '24px', height: '24px', color: 'hsl(var(--primary))' }} />
                  </div>
                  <p style={{ fontSize: '16px', fontWeight: 600, color: 'hsl(var(--foreground))', marginBottom: '6px' }}>No notifications yet</p>
                  <p style={{ fontSize: '13px', color: 'hsl(var(--muted-foreground))' }}>Enable location tracking to receive deal alerts</p>
                </div>
              ) : (
                <>
                  {notifications.map((notification) => (
                    <div key={notification.id}>
                      <Suspense fallback={null}>
                        <NotificationCard 
                          notification={notification} 
                          onVenueClick={handleVenueSelect}
                          onRead={() => markAsRead(notification.id)}
                        />
                      </Suspense>
                    </div>
                  ))}
                </>
              )}
            </PageShell>
            </Suspense>
          )}

          {activeTab === "explore" && (
            <PageShell>
              <Suspense fallback={<ExploreTabSkeleton />}>
                <ExploreTab onVenueSelect={handleVenueSelect} />
              </Suspense>
            </PageShell>
          )}
        </main>
      )}

      {/* Bottom Navigation - Fixed on bottom, overlays map with glass effect */}
      <BottomNav 
        activeTab={activeTab} 
        onTabChange={handleTabChange}
        onPrefetch={(tab) => {
          // Prefetch Mapbox chunk on hover/touch of map tab
          if (tab === "map") {
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

      {/* Send to Friend Dialog - rendered outside JetCard portal */}
      {sendDialogUserId && selectedVenue && (
        <Suspense fallback={null}>
          <ShareToFriendDialog
            isOpen={showSendDialog}
            onClose={() => setShowSendDialog(false)}
            userId={sendDialogUserId}
            venue={{
              id: selectedVenue.id,
              name: selectedVenue.name,
              neighborhood: selectedVenue.neighborhood,
              category: selectedVenue.category,
              activity: selectedVenue.activity,
            }}
          />
        </Suspense>
      )}

      {/* PWA Install Prompt — only after sign-in + profile created, only on `/`.
          Lazy loaded. No skeleton fallback: a placeholder fixed at the bottom
          would overlap the map's bottom controls and bottom nav while loading,
          making it look like the map is broken. */}
      <Suspense fallback={null}>
        <AuthPWAInstallPromptWrapper showSignUpCtaForAnonymous />
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
