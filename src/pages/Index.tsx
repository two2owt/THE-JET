import {
  useState,
  useEffect,
  useRef,
  lazy,
  Suspense,
  useCallback,
  useMemo,
} from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { type Venue } from "@/types/venue";

// Critical path: BottomNav is always visible
import { BottomNav } from "@/components/BottomNav";
import { useHeaderConfig } from "@/contexts/HeaderContext";

// Hooks must be imported synchronously (React rules)
import { useMapboxToken } from "@/hooks/useMapboxToken";
import { useHydrated } from "@/hooks/useHydrated";
import { useSwipeToDismiss } from "@/hooks/useSwipeToDismiss";
import { useBreakpointUp } from "@/hooks/useBreakpoint";
import { useVenueImages } from "@/hooks/useVenueImages";
import { useNotifications } from "@/hooks/useNotifications";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { useAutoScrapeVenueImages } from "@/hooks/useAutoScrapeVenueImages";
import { useDeals } from "@/hooks/useDeals";
import { useVenueActivity } from "@/hooks/useVenueActivity";
import { useBottomNavigation } from "@/hooks/useBottomNavigation";
import { useMapPanelInset } from "@/hooks/useMapPanelInset";
import { useSearchParams } from "@/lib/router-compat";
import {
  getCategoryById,
  resolveVenueCategory,
} from "@/lib/venue-categories";
import { analytics } from "@/lib/analytics";
// Extracted concerns: onboarding gating, city launches, deep-link routing
import { useOnboardingGate } from "@/hooks/useOnboardingGate";
import { useCitySelection } from "@/hooks/useCitySelection";
import { useVenueDeepLinks } from "@/hooks/useVenueDeepLinks";

import { CityTransitionOverlay } from "@/components/CityTransitionOverlay";
import { MapSurface } from "@/components/map/MapSurface";
import { MapCardPortal } from "@/components/map/MapCardPortal";
import { JetCardSkeleton } from "@/components/skeletons/JetCardSkeleton";

const LocationPermissionPrompt = lazy(() =>
  import("@/components/LocationPermissionPrompt").then((m) => ({
    default: m.LocationPermissionPrompt,
  })),
);

// Lazy load interaction-triggered components - not needed for first paint
const JetCard = lazy(() =>
  import("@/components/JetCard").then((m) => ({ default: m.JetCard })),
);
const ParkingCard = lazy(() =>
  import("@/components/ParkingCard").then((m) => ({ default: m.ParkingCard })),
);
const DirectionsDialog = lazy(() => import("@/components/DirectionsDialog"));
const ShareToFriendDialog = lazy(() =>
  import("@/components/ShareToFriendDialog").then((m) => ({
    default: m.ShareToFriendDialog,
  })),
);

// Lazy load non-critical UI - deferred until after FCP
const OfflineBanner = lazy(() =>
  import("@/components/OfflineBanner").then((m) => ({
    default: m.OfflineBanner,
  })),
);
const AuthPWAInstallPromptWrapper = lazy(() =>
  import("@/components/AuthPWAInstallPromptWrapper").then((m) => ({
    default: m.AuthPWAInstallPromptWrapper,
  })),
);

const Index = () => {


  // Redirects signed-in users who haven't finished onboarding.
  useOnboardingGate();

  // Shared navigation hook for consistent tab handling
  const { activeTab, setActiveTab, handleTabChange } = useBottomNavigation({
    defaultTab: "map",
  });
  const { unreadCount: unreadMessages } = useUnreadMessages();

  // Location streaming is mounted once app-wide in `AppShell` so background
  // tracking (when enabled in preferences) survives tab/route changes.
  const [mapUIResetKey, setMapUIResetKey] = useState(0);
  const [selectedParking, setSelectedParking] = useState<{
    lat: number;
    lng: number;
    name?: string;
  } | null>(null);

  const {
    selectedCity,
    cityName,
    cityTransitionNonce,
    handleCityChange,
    handleNearestCityDetected,
    handleDetectedLocationNameChange,
  } = useCitySelection();

  const [showDirectionsDialog, setShowDirectionsDialog] = useState(false);
  const [showSendDialog, setShowSendDialog] = useState(false);
  const [sendDialogUserId, setSendDialogUserId] = useState<string | null>(null);

  const {
    token: mapboxToken,
    loading: mapboxLoading,
    error: mapboxError,
  } = useMapboxToken();
  // Gate the map on hydration: the token can already be warm in cache on the
  // client, so rendering it during hydration diverged from the empty SSR tree.
  const hydrated = useHydrated();
  const { getVenueImage } = useVenueImages();

  // Idle-defer non-critical data hooks so they don't block LCP / inflate TBT
  // on the landing route.
  const [dataReady, setDataReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const trigger = () => {
      if (!cancelled) setDataReady(true);
    };
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

  // Only the unread badge is needed here — the alerts list lives at /alerts.
  const { notifications } = useNotifications(dataReady);
  const unreadNotifications = notifications.filter((n) => !n.read).length;
  useAutoScrapeVenueImages(dataReady);
  const {
    deals,
    refresh: refreshDeals,
    loading: dealsLoading,
    lastUpdated: dealsLastUpdated,
  } = useDeals(false, dataReady);
  const {
    venues: realVenues,
    loading: venuesLoading,
    refresh: refreshVenues,
    lastUpdated: venuesLastUpdated,
  } = useVenueActivity(dataReady, selectedCity);
  // Category filter lives in the URL (`?cat=bar`) so a chip tap, a search
  // "Categories" chip and a shared link all land on the same filtered map.
  // The URL is the single source of truth: refreshes and deep links restore
  // the filter, and each chip tap pushes a history entry so browser
  // back/forward walks the filter history instead of leaving the map stuck.
  const [searchParams, setSearchParams] = useSearchParams();
  const catParam = searchParams.get("cat");
  // `?cat=bar,coffee` — a comma-separated multi-select. Unknown ids are
  // dropped; order is de-duped and stable so links stay canonical.
  const categoryFilter = useMemo(() => {
    if (!catParam) return [] as string[];
    const seen = new Set<string>();
    for (const raw of catParam.split(",")) {
      const id = raw.trim();
      if (id && getCategoryById(id)) seen.add(id);
    }
    return Array.from(seen);
  }, [catParam]);
  const catKey = categoryFilter.join(",");
  const handleCategoryFilterChange = useCallback(
    (next: string[]) => {
      const nextKey = Array.from(new Set(next)).join(",");
      // Re-selecting the live filter would push a duplicate entry that back
      // has to chew through, so ignore no-op changes.
      if (nextKey === catKey) return;
      setSearchParams((prev) => {
        const p = new URLSearchParams(prev);
        if (nextKey) p.set("cat", nextKey);
        else p.delete("cat");
        return p;
      });
    },
    [setSearchParams, catKey],
  );

  // Unknown/stale ids (renamed taxonomy, hand-typed URL) are ignored when
  // rendering; rewrite the URL so what's shown matches the link the user
  // would copy. Replace, never push — this isn't a user action.
  useEffect(() => {
    if (catParam !== null && catParam !== catKey) {
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (catKey) p.set("cat", catKey);
          else p.delete("cat");
          return p;
        },
        { replace: true },
      );
    }
  }, [catParam, catKey, setSearchParams]);


  const jetCardRef = useRef<HTMLDivElement>(null);

  const parkingCardRef = useRef<HTMLDivElement>(null);
  // Swipe-to-dismiss JetCard only on touch-first viewports (< md).
  const isMobile = !useBreakpointUp("md");

  // Venues come exclusively from the live merchant-driven dataset. Dedupe by
  // id defensively.
  const venues = useMemo(() => {
    if (!realVenues || realVenues.length === 0) return [];
    const map = new Map<string, Venue>();
    for (const v of realVenues) map.set(v.id, v);
    return Array.from(map.values());
  }, [realVenues]);

  // Owns selectedVenue, the `?venue=`/`?deal=` sync and the whole deep-link
  // resolution + analytics chain.
  const { selectedVenue, setSelectedVenue } = useVenueDeepLinks({
    venues,
    venuesLoading,
    selectedCity,
    getVenueImage,
    setActiveTab,
    jetCardRef,
  });

  // Lift map overlays by the panels' *measured* height so nothing overlaps and
  // no dead space is reserved when a card is closed.
  useMapPanelInset(jetCardRef, !!selectedVenue && activeTab === "map");
  useMapPanelInset(parkingCardRef, !!selectedParking && activeTab === "map");

  const { handlers: swipeHandlers, style: swipeStyle } = useSwipeToDismiss({
    onDismiss: () => setSelectedVenue(null),
    threshold: 80,
    direction: "down",
  });

  // Reset map UI collapsed state when switching to map tab
  useEffect(() => {
    if (activeTab === "map") setMapUIResetKey((prev) => prev + 1);
  }, [activeTab]);

  const handleVenueSelect = useCallback(
    (venue: Venue | string) => {
      const resolved =
        typeof venue === "string"
          ? venues.find((v) => v.name === venue)
          : venue;
      if (!resolved) return;
      setSelectedVenue({
        ...resolved,
        imageUrl: getVenueImage(resolved.name) || resolved.imageUrl,
      });
      // Conversion step: did a category-filtered view lead to a JetCard tap?
      if (categoryFilter.length > 0) {
        analytics.categoryFilteredVenueOpened(
          resolved.id,
          resolved.name,
          resolveVenueCategory(resolved.category).id,
          categoryFilter,
        );
      }
      // Always surface the JetCard on the map so the marker context lines up
      // with the card (and the card isn't obscured by other tabs' chrome).
      setActiveTab("map");
      toast.success(`Selected ${resolved.name}`, {
        description: `${resolved.activity}% active in ${resolved.neighborhood}`,
      });
    },
    [venues, getVenueImage, setActiveTab, setSelectedVenue, categoryFilter],
  );

  const handleParkingSelect = useCallback(
    (parking: { lat: number; lng: number; name?: string }) => {
      setSelectedVenue(null); // Close venue card if open
      setSelectedParking(parking);
    },
    [setSelectedVenue],
  );

  const handleGetDirections = useCallback(async () => {
    if (!selectedVenue) return;
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

  // Use refs for callbacks to avoid infinite loop: setHeaderConfig detects
  // new function references as "changes", triggering re-render, which creates
  // new refs, which triggers setHeaderConfig again.
  const handleVenueSelectRef = useRef(handleVenueSelect);
  handleVenueSelectRef.current = handleVenueSelect;
  const refreshBothRef = useRef(refreshBoth);
  refreshBothRef.current = refreshBoth;

  // Stable wrappers that never change identity
  const stableOnVenueSelect = useMemo(
    () =>
      ((v: Venue | string) => handleVenueSelectRef.current(v)) as (
        v: Venue | string,
      ) => void,
    [],
  );
  const stableOnRefresh = useMemo(() => () => refreshBothRef.current(), []);

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
  }, [
    setHeaderConfig,
    venues,
    deals,
    stableOnVenueSelect,
    dealsLoading,
    venuesLoading,
    dealsLastUpdated,
    venuesLastUpdated,
    stableOnRefresh,
    cityName,
  ]);

  return (
    <div
      className="relative w-full"
      style={{
        flex: "1 1 0%",
        minHeight: 0,
        isolation: "isolate",
        position: "relative",
      }}
    >
      <h1 className="sr-only">
        JET — Real-time heatmap of live deals, events, and trending venues near
        you
      </h1>

      {/* FULL-SCREEN MAP LAYER - only on map tab */}

      {activeTab === "map" && (
        <>
          <MapSurface
            mapboxToken={mapboxToken}
            mapboxLoading={mapboxLoading}
            mapboxError={mapboxError}
            hydrated={hydrated}
            venues={venues}
            venuesLoading={venuesLoading}
            selectedVenue={selectedVenue}
            selectedCity={selectedCity}
            resetUIKey={mapUIResetKey}
            onVenueSelect={handleVenueSelect}
            onParkingSelect={handleParkingSelect}
            onCityChange={handleCityChange}
            onNearestCityDetected={handleNearestCityDetected}
            onDetectedLocationNameChange={handleDetectedLocationNameChange}
            categoryFilter={categoryFilter}
            onCategoryFilterChange={handleCategoryFilterChange}
          />
          {/* Location permission is asked from the map context only. */}
          <Suspense fallback={null}>
            <LocationPermissionPrompt />
          </Suspense>
        </>
      )}


      {/* Plane takeoff/landing animation triggered by city changes */}
      {typeof document !== "undefined" &&
        createPortal(
          <CityTransitionOverlay
            city={selectedCity}
            nonce={cityTransitionNonce}
          />,
          document.body,
        )}

      {selectedVenue && activeTab === "map" && (
        <MapCardPortal
          ref={jetCardRef}
          isMobile={isMobile}
          swipeStyle={swipeStyle}
          swipeHandlers={swipeHandlers}
        >
          <Suspense fallback={<JetCardSkeleton />}>
            <JetCard
              venue={selectedVenue}
              onGetDirections={handleGetDirections}
              onClose={() => setSelectedVenue(null)}
              onSendToFriend={async () => {
                const {
                  data: { session: activeSession },
                } = await supabase.auth.getSession();
                if (!activeSession?.user) {
                  toast.error("Sign in to send venues to friends");
                  return;
                }
                setSendDialogUserId(activeSession.user.id);
                setShowSendDialog(true);
              }}
            />
          </Suspense>
        </MapCardPortal>
      )}

      {selectedParking && activeTab === "map" && (
        <MapCardPortal ref={parkingCardRef} isMobile={isMobile}>
          <Suspense fallback={null}>
            <ParkingCard
              lat={selectedParking.lat}
              lng={selectedParking.lng}
              name={selectedParking.name}
              onClose={() => setSelectedParking(null)}
            />
          </Suspense>
        </MapCardPortal>
      )}

      {/* Offline Banner - lazy loaded, non-critical */}
      <Suspense fallback={null}>
        <OfflineBanner />
      </Suspense>

      {/* Bottom Navigation - Fixed on bottom, overlays map with glass effect */}
      <BottomNav
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onPrefetch={(tab) => {
          if (tab === "map") import("@/components/MapboxHeatmap");
          if (tab === "deals") import("@/components/ExploreTab");
        }}
        notificationCount={unreadNotifications}
        messageCount={unreadMessages}
      />

      {/* Directions Dialog - Lazy loaded */}
      <Suspense fallback={null}>
        <DirectionsDialog
          open={showDirectionsDialog}
          onOpenChange={setShowDirectionsDialog}
          venue={selectedVenue}
        />
      </Suspense>

      {/* Send to Friend Dialog - rendered outside the JetCard portal */}
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
          No skeleton fallback: a placeholder fixed at the bottom would overlap
          the map's bottom controls while loading. */}
      <Suspense fallback={null}>
        <AuthPWAInstallPromptWrapper showSignUpCtaForAnonymous />
      </Suspense>

      {/* Push opt-in lives on the Deals tab (`/deals`) — the moment the ask is
          contextual — not here on the map. */}

    </div>
  );
};

export default Index;
