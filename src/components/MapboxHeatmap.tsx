import { devLog } from "@/lib/log";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { storeLastKnownLocation } from "@/lib/tile-prefetch";
import { GEO_GRANTED_EVENT } from "@/lib/geolocationGrantEvent";
import { subscribeMapInteractionLock } from "@/lib/mapInteractionLock";
import { verifyMapboxVersion } from "@/lib/mapbox-version";
import {
  createTileRetryController,
  type TileRetryController,
} from "@/lib/mapTileRetry";
import type * as MapboxGL from "mapbox-gl";
import { markMapPainted } from "@/lib/mapPaintSignal";
import type { FeatureCollection, Geometry } from "geojson";
import {
  LAYER_KEYS as SHARED_LAYER_KEYS,
  readLayerState,
  clearPersistedLayerState,
  clearPersistedLayerUrl,
  serializeLayersParam,
} from "@/components/map/layerPersistence";

// Type alias for the mapbox-gl default export
type MapboxGLModule = typeof import("mapbox-gl").default;

// In production, mapbox-gl is loaded from CDN as window.mapboxgl
// In development, we use the npm package for HMR
let mapboxglModule: MapboxGLModule | null = null;
let mapboxLoadPromise: Promise<MapboxGLModule> | null = null;

// CDN load timeout - wait for CDN script to load before falling back
const CDN_LOAD_TIMEOUT = 8000; // 8 seconds

// Wait for CDN mapbox-gl to be available with timeout
const waitForCDNMapbox = (): Promise<MapboxGLModule | null> => {
  return new Promise((resolve) => {
    // Check immediately
    if (typeof window !== "undefined" && window.mapboxgl) {
      resolve(window.mapboxgl);
      return;
    }

    // Poll every 100ms for up to CDN_LOAD_TIMEOUT
    const startTime = Date.now();
    const checkInterval = setInterval(() => {
      if (typeof window !== "undefined" && window.mapboxgl) {
        clearInterval(checkInterval);
        resolve(window.mapboxgl);
      } else if (Date.now() - startTime > CDN_LOAD_TIMEOUT) {
        clearInterval(checkInterval);
        console.warn(
          "MapboxHeatmap: CDN load timeout, falling back to bundled version",
        );
        resolve(null);
      }
    }, 100);
  });
};

const loadMapboxGL = async (): Promise<MapboxGLModule> => {
  if (mapboxglModule) return mapboxglModule;

  if (!mapboxLoadPromise) {
    mapboxLoadPromise = (async () => {
      // First, try to use CDN version (production)
      const cdnMapbox = await waitForCDNMapbox();
      if (cdnMapbox) {
        devLog("MapboxHeatmap: Using CDN mapbox-gl");
        verifyMapboxVersion(cdnMapbox, "cdn");
        mapboxglModule = cdnMapbox;
        return mapboxglModule;
      }

      // Fallback to dynamic import (development or if CDN fails)
      devLog("MapboxHeatmap: Loading mapbox-gl via import");
      try {
        const m = await import("mapbox-gl");
        // Also load the CSS in dev
        await import("mapbox-gl/dist/mapbox-gl.css");
        verifyMapboxVersion(m.default, "bundle");
        mapboxglModule = m.default;
        return m.default;
      } catch (importError) {
        console.error(
          "MapboxHeatmap: Failed to import mapbox-gl:",
          importError,
        );
        throw new Error(
          "Failed to load map library. Please check your connection and refresh.",
        );
      }
    })();
  }
  return mapboxLoadPromise;
};
import {
  MapPin,
  Layers,
  Palette,
  X,
  AlertCircle,
  Route,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Clock,
  ChevronDown,
  ChevronUp,
  Car,
  BarChart3,
  RotateCcw,
  Calendar,
  Loader2,
  Flame,
} from "lucide-react";
import { HeatmapSkeleton } from "@/components/skeletons/HeatmapSkeleton";
import { useLocationDensity } from "@/hooks/useLocationDensity";
import { useMovementPaths } from "@/hooks/useMovementPaths";
import { useHeatmapTimelapse } from "@/hooks/useHeatmapTimelapse";
import { useBreakpointUp } from "@/hooks/useBreakpoint";
import {
  applyMapScaleFactor,
  getMapScaleFactor,
} from "@/lib/mapScaleFactor";
import { useOpenVenues } from "@/hooks/useOpenVenues";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { triggerHaptic } from "@/lib/haptics";
import { buildVenueOpenStatus } from "@/lib/venue-open-cache";
import { useOpenNowTick } from "@/hooks/useOpenNowTick";
import { Button } from "./ui/button";
import { LayerToggleRow } from "./map/LayerToggleRow";
import { LayerSliderRow } from "./map/LayerSliderRow";
import { HeatmapColorLegend } from "./map/HeatmapColorLegend";
import { HeatCellInspector, type HeatCell } from "./map/HeatCellInspector";
import { HeatFilterChips } from "./map/HeatFilterChips";
import {
  activityColor,
  activityLegendTiers,
  activityTier,
  casingFor,
} from "@/lib/activity-palette";
import {
  LiveStatsPanel,
  liveStatsRangeToTimeFilter,
  type LiveStatsRange,
} from "./map/LiveStatsPanel";
import { useDensityLayer } from "./map/hooks/useDensityLayer";
import { useMarkerDeclutter } from "./map/hooks/useMarkerDeclutter";
import {
  featuresOf,
  lineCoords,
  numProp,
  pointCoords,
  type MapFeature,
  type Position,
} from "./map/geojson";
import { useMapRecenterPolicy } from "./map/hooks/useMapRecenterPolicy";
import { useMapLayerToggles } from "./map/hooks/useMapLayerToggles";
import {
  createClusterMarkerElement,
  getCategoryFloral,
  getCategoryIcon,
  markerZoomFactor,
  planarDistance,
} from "./map/markerStyles";
import { clusterVenues, CLUSTER_MAX_ZOOM } from "./map/venueClusters";
import {
  useMovementPathsLayer,
  FLOW_LINE_ELEVATION_LAYOUT,
} from "./map/hooks/useMovementPathsLayer";
import { useLayerPersistence } from "./map/hooks/useLayerPersistence";
import { Select, SelectContent, SelectItem, SelectTrigger } from "./ui/select";
import { Slider } from "./ui/slider";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./ui/collapsible";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "./ui/sheet";
import { Input } from "./ui/input";
import { Search } from "lucide-react";

import {
  CITIES,
  type City,
  getNearestCity,
  getCitiesSortedByDistance,
  kmToMiles,
} from "@/types/cities";
import { getCachedReverseGeocode } from "@/utils/reverseGeocode";
import { searchUsCities, type GeocodedCity } from "@/utils/forwardGeocode";

import locationPuckIcon from "@/assets/location-puck.png";

// Re-export Venue type for backwards compatibility
export type { Venue } from "@/types/venue";
import type { Venue } from "@/types/venue";

interface MapboxHeatmapProps {
  onVenueSelect: (venue: Venue) => void;
  onParkingSelect?: (parking: {
    lat: number;
    lng: number;
    name?: string;
  }) => void;
  venues: Venue[];
  mapboxToken: string;
  selectedCity: City;
  onCityChange: (city: City) => void;
  onNearestCityDetected?: (city: City) => void; // Called when geolocation detects nearest city
  onDetectedLocationNameChange?: (name: string | null) => void; // Called when reverse geocoded location name changes
  isLoadingVenues?: boolean;
  selectedVenue?: Venue | null;
  resetUIKey?: number; // Incremented when tab changes to reset collapsed UI state
  isTokenLoading?: boolean; // True while the mapbox token is being fetched
}

/**
 * Activity fill for a marker. Delegates to the shared palette so the markers
 * and the Activity legend can never drift apart, and so the colour responds to
 * the *basemap* rather than the app theme — the map style can be light while
 * the app is in dark mode.
 */
const getActivityColor = (activity: number, isLightBasemap: boolean) =>
  activityColor(activity, isLightBasemap);

// Platform detection for optimized settings
const getPlatformSettings = (isMobile: boolean) => {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isAndroid = /Android/.test(navigator.userAgent);
  const isPWA = window.matchMedia("(display-mode: standalone)").matches;
  const isLowPowerMode =
    ("connection" in navigator && navigator.connection?.saveData) ?? false;
  const hasReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  const isSlowConnection =
    "connection" in navigator &&
    ["slow-2g", "2g", "3g"].includes(
      navigator.connection?.effectiveType ?? "",
    );

  return {
    // Reduce pitch on mobile for better performance
    pitch: isMobile ? (isLowPowerMode ? 0 : 30) : 50,
    // Disable antialiasing on mobile for performance
    antialias: !isMobile && !isLowPowerMode,
    // Fade duration - instant on mobile/low power
    fadeDuration: isMobile || isLowPowerMode || hasReducedMotion ? 0 : 100,
    // Tile cache - smaller on mobile, larger on desktop for better caching
    maxTileCacheSize: isMobile ? 25 : 150,
    // Cooperative gestures disabled - allow single finger pan on all devices
    cooperativeGestures: false,
    // Touch controls
    touchZoomRotate: true,
    touchPitch: !isMobile,
    dragRotate: !isMobile,
    // Animation durations
    flyToDuration: hasReducedMotion ? 0 : isMobile ? 1000 : 1500,
    // Marker animation
    markerAnimation: !hasReducedMotion && !isLowPowerMode,
    // Platform flags
    isIOS,
    isAndroid,
    isPWA,
    isLowPowerMode,
    hasReducedMotion,
    isSlowConnection,
    // Use 1x tiles on slow connections or low power mode for 75% less data
    useRetinaSprite: !isSlowConnection && !isLowPowerMode,
    // Higher initial zoom = fewer tiles loaded
    minZoom: isMobile ? 10 : 9,
    // Limit max zoom on mobile to reduce tile requests
    maxZoom: isMobile ? 17 : 18,
  };
};

export const MapboxHeatmap = ({
  onVenueSelect,
  onParkingSelect,
  venues: allVenues,
  mapboxToken,
  selectedCity,
  onCityChange,
  onNearestCityDetected,
  onDetectedLocationNameChange,
  isLoadingVenues = false,
  selectedVenue,
  resetUIKey,
}: MapboxHeatmapProps) => {
  // Filter venues by Google Places opening hours against the device's local
  // time. Markers (and the underlying heatmap source) automatically refresh
  // every minute as venues open/close. Venues without parseable hours stay
  // visible (fail-open) so unknown data doesn't blank out the map.
  const venues = useOpenVenues(allVenues);
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<MapboxGL.Map | null>(null);
  const mapboxglRef = useRef<MapboxGLModule | null>(null);
  const tileRetry = useRef<TileRetryController | null>(null);
  const [mapboxLoaded, setMapboxLoaded] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapInitializing, setMapInitializing] = useState(true);
  // Drives the single crossfade from HeatmapSkeleton -> interactive map.
  // Stays true until the opacity transition completes after mapLoaded flips.
  const [skeletonMounted, setSkeletonMounted] = useState(true);
  const [loadingStage, setLoadingStage] = useState<
    "module" | "init" | "style" | "ready"
  >("module");
  const [mapError, setMapError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const userMarker = useRef<MapboxGL.Marker | null>(null);
  const markersRef = useRef<MapboxGL.Marker[]>([]);
  // Keyed index of every live marker (venue pins + cluster bubbles) so marker
  // passes reconcile instead of tearing down and rebuilding the whole field.
  // Key encodes everything that affects a marker's appearance, so an unchanged
  // marker is reused as-is (no flicker) and a changed one is swapped in place.
  const markerIndexRef = useRef<Map<string, MapboxGL.Marker>>(new Map());
  // Monotonic pass id — a late rAF from a superseded pass bails out instead of
  // duplicating markers when cities switch quickly.
  const markerPassRef = useRef(0);
  // Quantized zoom step used to re-run clustering (-1 = clustering disabled).
  const [clusterStep, setClusterStep] = useState(-1);
  const dealMarkersRef = useRef<MapboxGL.Marker[]>([]);
  // Tracks the currently-open marker chip so we can close prior chips cleanly
  // when selection changes or the user taps elsewhere on the map.
  const activeChipRef = useRef<{
    el: HTMLElement;
    venueId: string;
    hide: () => void;
  } | null>(null);
  const [venueDealCounts, setVenueDealCounts] = useState<
    Record<string, number>
  >({});
  const geolocateControlRef = useRef<MapboxGL.GeolocateControl | null>(null);
  // Applies a raw geolocation fix (city sync, marker, label) — set once the map
  // and geolocate handler are wired, so UI controls can refresh location too.
  const applyGeolocationRef = useRef<
    ((coords: { latitude: number; longitude: number }) => void) | null
  >(null);
  const onVenueSelectRef = useRef(onVenueSelect);
  onVenueSelectRef.current = onVenueSelect;
  const onParkingSelectRef = useRef(onParkingSelect);
  onParkingSelectRef.current = onParkingSelect;
  const flowAnimationRef = useRef<number | null>(null);
  // Treat anything below the `md` breakpoint as a phone-class device for
  // Mapbox tuning: lower tile cache, disabled rotate/pitch, faster fades.
  // Tablets (md+) get the desktop-grade settings.
  // Call every breakpoint hook unconditionally at the top so hook order is
  // stable across renders (react-hooks/rules-of-hooks), then derive the
  // named tiers from those booleans.
  const isMdUp = useBreakpointUp("md");
  const isLgUp = useBreakpointUp("lg");
  const isXlUp = useBreakpointUp("xl");
  const isMobile = !isMdUp;
  const isTablet = isMdUp && !isLgUp;
  const isDesktopWide = isLgUp;
  const isDesktopXL = isXlUp;

  // Adaptive panel metrics — one source of truth for the desktop Layers
  // container so width, padding, and inner gap scale together across
  // breakpoints instead of being hardcoded per-property.
  // Tablet has ample horizontal room, so it gets a desktop-class width —
  // the previous 244px forced label truncation ("Time r…") and 3-row chip
  // wrapping. Widths stay below 92vw so nothing overflows on small screens.
  const panelWidth = isDesktopXL
    ? 340
    : isDesktopWide
      ? 312
      : isTablet
        ? 304
        : 240;
  const panelPad = isDesktopXL ? 14 : isDesktopWide ? 13 : isTablet ? 12 : 10;
  const panelGap = isDesktopXL ? 10 : isDesktopWide ? 9 : 8;
  const panelMaxH = isDesktopXL ? 760 : isDesktopWide ? 700 : 640;
  const initStartTime = useRef<number>(0);
  const platformSettings = useRef(getPlatformSettings(isMobile));

  // Load mapbox-gl module on mount (deferred to reduce TBT)
  useEffect(() => {
    let mounted = true;
    loadMapboxGL()
      .then((mapboxgl) => {
        if (mounted) {
          mapboxglRef.current = mapboxgl;
          setMapboxLoaded(true);
          setLoadingStage("init");
          devLog("MapboxHeatmap: mapbox-gl module loaded");
        }
      })
      .catch((err) => {
        console.error("MapboxHeatmap: Failed to load mapbox-gl:", err);
        // Provide user-friendly error messages
        const errorMessage = err?.message || "Unknown error";
        if (errorMessage.includes("Failed to load map library")) {
          setMapError(
            "Unable to load map. Please check your internet connection.",
          );
        } else if (
          errorMessage.includes("network") ||
          errorMessage.includes("fetch")
        ) {
          setMapError(
            "Network error. Please check your connection and try again.",
          );
        } else {
          setMapError("Failed to load map. Please refresh the page.");
        }
        setMapInitializing(false);
      });
    return () => {
      mounted = false;
    };
  }, [retryCount]); // Re-run when retryCount changes

  // Layer persistence helpers (URL params take priority, localStorage fallback).
  // Unknown keys in the URL are ignored; any layer missing from the URL falls
  // back to localStorage, then to the hard-coded default below.
  const LAYER_KEYS = SHARED_LAYER_KEYS;
  type LayerName = keyof typeof LAYER_KEYS;

  // Filter / time-lapse localStorage keys
  const FILTER_KEYS = {
    timeFilter: "jet-map-time-filter",
    pathTimeFilter: "jet-map-path-time-filter",
    dayFilter: "jet-map-day-filter",
    timelapseMode: "jet-map-timelapse-mode",
    timelapseSpeed: "jet-map-timelapse-speed",
    pathsWindow: "jet-map-paths-window",
    heatWindow: "jet-map-heat-window",
    heatIntensity: "jet-map-heat-intensity",
  } as const;
  const VALID_TIME_FILTERS = new Set<
    "all" | "today" | "this_week" | "this_hour"
  >(["all", "today", "this_week", "this_hour"]);
  // Kept for backwards-compat with legacy persisted values.
  const LEGACY_SPEEDS = new Set<number>([0.5, 1, 2]);

  const getLayerState = (layer: LayerName, fallback: boolean): boolean =>
    readLayerState(layer, window.location.search, fallback);

  const getPersistedTimeFilter = (
    key: string,
    fallback: "all" | "today" | "this_week" | "this_hour",
    urlKey?: string,
  ): "all" | "today" | "this_week" | "this_hour" => {
    try {
      if (urlKey) {
        const params = new URLSearchParams(window.location.search);
        const raw = params.get(urlKey);
        if (raw && VALID_TIME_FILTERS.has(raw as any))
          return raw as "all" | "today" | "this_week" | "this_hour";
      }
    } catch {
      /* ignore */
    }
    try {
      const raw = localStorage.getItem(key);
      if (raw && VALID_TIME_FILTERS.has(raw as any))
        return raw as "all" | "today" | "this_week" | "this_hour";
    } catch {
      /* ignore */
    }
    return fallback;
  };

  const getPersistedDayFilter = (): number | undefined => {
    try {
      const params = new URLSearchParams(window.location.search);
      const raw = params.get("day");
      if (raw !== null) {
        if (raw === "all") return undefined;
        const n = parseInt(raw, 10);
        if (!Number.isNaN(n) && n >= 0 && n <= 6) return n;
      }
    } catch {
      /* ignore */
    }
    // No `?day=` in the URL: fall back to the current tab session so a
    // refresh (or a router navigation that rewrote the query) keeps the
    // user's selection. Deliberately sessionStorage, not localStorage —
    // a brand new session still defaults to "All Days".
    try {
      const raw = sessionStorage.getItem(FILTER_KEYS.dayFilter);
      if (raw !== null && raw !== "all") {
        const n = parseInt(raw, 10);
        if (!Number.isNaN(n) && n >= 0 && n <= 6) return n;
      }
    } catch {
      /* ignore */
    }
    return undefined;
  };

  const getPersistedTimelapseMode = (): boolean => {
    try {
      const raw = localStorage.getItem(FILTER_KEYS.timelapseMode);
      return raw === "true";
    } catch {
      /* ignore */
    }
    return false;
  };

  const getPersistedTimelapseSpeed = (): number => {
    try {
      const raw = localStorage.getItem(FILTER_KEYS.timelapseSpeed);
      if (raw) {
        const n = parseFloat(raw);
        // Accept any positive number in [0.25, 4]. Legacy 0.5/1/2 values pass
        // through this check too, and older 3-button presets keep working.
        if (Number.isFinite(n) && n >= 0.25 && n <= 4) return n;
        if (LEGACY_SPEEDS.has(n)) return n;
      }
    } catch {
      /* ignore */
    }
    return 1;
  };

  // Flow Paths time-window slider. Persisted so a user's tuned map view
  // survives a reload.
  const getPersistedWindowMinutes = (key: string): number | null => {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null || raw === "" || raw === "off") return null;
      const n = parseInt(raw, 10);
      if (Number.isFinite(n) && n >= 1 && n <= 10080) return n;
    } catch {
      /* ignore */
    }
    return null;
  };

  // Density heatmap state
  const [showDensityLayer, setShowDensityLayer] = useState(() =>
    getLayerState("density", false),
  );
  const [showParking, setShowParking] = useState(() =>
    getLayerState("parking", false),
  );
  // Keep a ref so style reloads can restore the parking layer with the latest visibility
  const showParkingRef = useRef(showParking);
  showParkingRef.current = showParking;
  // Live Stats panel — hidden by default, opt-in via layers toggle
  const [showLiveStats, setShowLiveStats] = useState(() =>
    getLayerState("stats", false),
  );
  const [timeFilter, setTimeFilter] = useState<
    "all" | "today" | "this_week" | "this_hour"
  >(() => getPersistedTimeFilter(FILTER_KEYS.timeFilter, "all", "time"));
  const [hourFilter, setHourFilter] = useState<number | undefined>();
  const [dayFilter, setDayFilter] = useState<number | undefined>(() =>
    getPersistedDayFilter(),
  );
  // Auto-detect time of day based on local time
  const getTimeOfDayPreset = (): "dawn" | "day" | "dusk" | "night" => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 8) return "dawn";
    if (hour >= 8 && hour < 17) return "day";
    if (hour >= 17 && hour < 20) return "dusk";
    return "night";
  };

  // Light base style during dawn/day hours, dark base style at dusk/night.
  const styleForTimeOfDay = (
    preset: "dawn" | "day" | "dusk" | "night",
  ): "light" | "dark" =>
    preset === "dawn" || preset === "day" ? "light" : "dark";

  const [mapStyle, setMapStyle] = useState<
    "light" | "dark" | "streets" | "satellite"
  >(() => styleForTimeOfDay(getTimeOfDayPreset()));
  const [lightPreset, setLightPreset] = useState<
    "dawn" | "day" | "dusk" | "night"
  >(getTimeOfDayPreset);
  // Once the user picks a style manually, stop auto-switching for the session.
  const manualStyleOverride = useRef(false);

  // Re-evaluate time of day every minute and swap the base style at dawn/dusk.
  useEffect(() => {
    const tick = () => {
      const preset = getTimeOfDayPreset();
      setLightPreset(preset);
      if (!manualStyleOverride.current) {
        setMapStyle((prev) => {
          const next = styleForTimeOfDay(preset);
          return prev === next ? prev : next;
        });
      }
    };
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, []);
  const [show3DTerrain, setShow3DTerrain] = useState(false);

  // Time-lapse mode state
  const [timelapseMode, setTimelapseMode] = useState(() =>
    getPersistedTimelapseMode(),
  );

  // Live Stats range selector (Current / Hourly / Daily / Weekly).
  const [liveStatsRange, setLiveStatsRange] =
    useState<LiveStatsRange>("current");
  const handleLiveStatsRangeChange = useCallback((next: LiveStatsRange) => {
    setLiveStatsRange(next);
    const tf = liveStatsRangeToTimeFilter(next);
    setTimeFilter(tf);
    setPathTimeFilter(tf);
  }, []);

  // Movement paths state
  const [showMovementPaths, setShowMovementPaths] = useState(() =>
    getLayerState("paths", false),
  );
  const [pathTimeFilter, setPathTimeFilter] = useState<
    "all" | "today" | "this_week" | "this_hour"
  >(() =>
    getPersistedTimeFilter(FILTER_KEYS.pathTimeFilter, "all", "pathTime"),
  );

  // Time-window override for Flow Paths only (last N minutes). null → use
  // coarse time_filter. The heatmap intentionally has no window: it relies
  // solely on time range + time-lapse settings.
  const [pathsWindowMinutes, setPathsWindowMinutes] = useState<number | null>(
    () => getPersistedWindowMinutes(FILTER_KEYS.pathsWindow),
  );

  // Heatmap time-range override (last N minutes). null → use the coarse
  // time-range chips. Persisted so a tuned view survives a reload.
  const [heatWindowMinutes, setHeatWindowMinutes] = useState<number | null>(
    () => getPersistedWindowMinutes(FILTER_KEYS.heatWindow),
  );
  // Discrete heatmap time-range steps. Index 0 = "Auto" (defer to the coarse
  // time-range chips); every other index is an explicit minutes window.
  const HEAT_WINDOW_STEPS: (number | null)[] = [
    null,
    60,
    360,
    720,
    1440,
    4320,
    10080,
    43200,
  ];
  const formatHeatWindow = (minutes: number | null | undefined) => {
    if (minutes == null) return "Auto";
    if (minutes < 60) return `${minutes}m`;
    if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
    return `${Math.round(minutes / 1440)}d`;
  };

  // Paint-only heat intensity multiplier (0.5 subtle → 2 punchy).
  const [heatIntensity, setHeatIntensity] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(FILTER_KEYS.heatIntensity);
      const n = raw ? parseFloat(raw) : NaN;
      if (Number.isFinite(n) && n >= 0.5 && n <= 2) return n;
    } catch {
      /* ignore */
    }
    return 1;
  });
  const heatWindowIndex = Math.max(
    0,
    HEAT_WINDOW_STEPS.indexOf(heatWindowMinutes),
  );
  useEffect(() => {
    try {
      localStorage.setItem(FILTER_KEYS.heatIntensity, String(heatIntensity));
      if (heatWindowMinutes === null)
        localStorage.removeItem(FILTER_KEYS.heatWindow);
      else
        localStorage.setItem(FILTER_KEYS.heatWindow, String(heatWindowMinutes));
    } catch {
      /* ignore */
    }
  }, [heatIntensity, heatWindowMinutes, FILTER_KEYS]);

  // Sync active layer toggles and filter selections to URL query params for shareability
  const syncUrlParams = useCallback(() => {
    const params = new URLSearchParams(window.location.search);

    // Layers — build the active set from component state and serialize via
    // the shared canonical order so writing then re-parsing is idempotent.
    // Also collapses any repeated `?layers=` entries (browsers or old deep
    // links can produce them) into a single canonical param.
    const active: LayerName[] = [];
    if (showDensityLayer) active.push("density");
    if (showMovementPaths) active.push("paths");
    if (showParking) active.push("parking");
    if (showLiveStats) active.push("stats");
    const nextLayers = serializeLayersParam(active);
    // `URLSearchParams.delete` removes every occurrence, so this is safe
    // even when the URL has multiple `layers` params.
    params.delete("layers");
    if (nextLayers) params.set("layers", nextLayers);

    // Filters
    if (timeFilter !== "all") params.set("time", timeFilter);
    else params.delete("time");

    if (dayFilter !== undefined) params.set("day", String(dayFilter));
    else params.delete("day");

    if (pathTimeFilter !== "all") params.set("pathTime", pathTimeFilter);
    else params.delete("pathTime");

    const search = params.toString();
    const newUrl = search
      ? `${window.location.pathname}?${search}`
      : window.location.pathname;
    window.history.replaceState(null, "", newUrl);
  }, [
    showDensityLayer,
    showMovementPaths,
    showParking,
    showLiveStats,
    timeFilter,
    dayFilter,
    pathTimeFilter,
  ]);

  useEffect(() => {
    syncUrlParams();
  }, [syncUrlParams]);

  // Mirror the day-of-week selection into the tab session so a refresh keeps
  // it even if another route navigation rewrote the query string.
  useEffect(() => {
    try {
      sessionStorage.setItem(
        FILTER_KEYS.dayFilter,
        dayFilter === undefined ? "all" : String(dayFilter),
      );
    } catch {
      /* ignore */
    }
  }, [dayFilter]);

  // Sync state FROM URL on browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);

      const timeRaw = params.get("time");
      setTimeFilter(
        timeRaw && VALID_TIME_FILTERS.has(timeRaw as any)
          ? (timeRaw as any)
          : "all",
      );

      const pathTimeRaw = params.get("pathTime");
      setPathTimeFilter(
        pathTimeRaw && VALID_TIME_FILTERS.has(pathTimeRaw as any)
          ? (pathTimeRaw as any)
          : "all",
      );

      const dayRaw = params.get("day");
      if (dayRaw === null) {
        setDayFilter(undefined);
      } else {
        const n = parseInt(dayRaw, 10);
        setDayFilter(!Number.isNaN(n) && n >= 0 && n <= 6 ? n : undefined);
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // Tick once a minute (aligned to the wall-clock boundary, and refreshed on
  // tab visibility / window focus) so the open/closed cache below stays fresh
  // even after backgrounded tabs, system sleep, or clock jumps.
  const openNowTick = useOpenNowTick();

  // Memoized venueId → open status map. Recomputed only when the venue list
  // identity changes or the minute tick fires — not on unrelated re-renders.
  const venueOpenStatus = useMemo(() => {
    return buildVenueOpenStatus(venues);
    // openNowTick intentionally invalidates the cache each minute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venues, openNowTick]);

  // All layer toggle / filter / paint slider persistence is centralized in
  // this hook so the container isn't littered with 15 tiny effects.
  useLayerPersistence({
    layerKeys: LAYER_KEYS,
    filterKeys: FILTER_KEYS,
    showDensityLayer,
    showMovementPaths,
    showParking,
    showLiveStats,
    timeFilter,
    pathTimeFilter,
    dayFilter,
    timelapseMode,
    pathsWindowMinutes,
  });

  // CLS fix: Defer layer controls render until map is loaded
  // This ensures controls appear immediately after map is ready, not a fixed delay
  const [controlsReady, setControlsReady] = useState(false);
  useEffect(() => {
    // Show controls as soon as map is loaded (no arbitrary delay)
    if (mapLoaded) {
      // Small delay to ensure map paint is complete
      const timer = setTimeout(() => setControlsReady(true), 100);
      return () => clearTimeout(timer);
    }
  }, [mapLoaded]);
  const [minPathFrequency, setMinPathFrequency] = useState(2);
  const [isTabVisible, setIsTabVisible] = useState(!document.hidden);

  // Controls visibility state - collapsed by default for maximum map visibility
  const [controlsCollapsed, setControlsCollapsed] = useState(true);
  // On mobile, auto-close the layers bottom sheet whenever a venue is
  // selected so the JetCard has clear space and never sits behind the sheet.
  useEffect(() => {
    if (isMobile && selectedVenue && !controlsCollapsed) {
      setControlsCollapsed(true);
    }
  }, [isMobile, selectedVenue, controlsCollapsed]);
  const [legendCollapsed, setLegendCollapsed] = useState(true);

  // User location state
  const [userLocation, setUserLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [detectedCity, setDetectedCity] = useState<City | null>(null); // Nearest predefined city for filtering
  const [detectedLocationName, setDetectedLocationName] = useState<
    string | null
  >(null); // Actual city name from reverse geocoding
  // Persisted across sessions so a returning user lands in the same mode
  // (selected city vs. current-location) without a brief flash.
  const [isUsingCurrentLocation, setIsUsingCurrentLocation] = useState<boolean>(
    () => {
      try {
        const raw =
          typeof window !== "undefined"
            ? window.localStorage.getItem("jet-map-use-current-location")
            : null;
        if (raw === "true") return true;
        if (raw === "false") return false;
      } catch {
        /* ignore */
      }
      return true; // Default: use current location
    },
  );
  useEffect(() => {
    try {
      window.localStorage.setItem(
        "jet-map-use-current-location",
        String(isUsingCurrentLocation),
      );
    } catch {
      /* ignore */
    }
  }, [isUsingCurrentLocation]);
  // Ref mirror so the (one-time-bound) geolocate event handler always sees the
  // latest value without needing to re-subscribe.
  const isUsingCurrentLocationRef = useRef(true);
  useEffect(() => {
    isUsingCurrentLocationRef.current = isUsingCurrentLocation;
  }, [isUsingCurrentLocation]);

  /**
   * Explicit "take me to my location" intent.
   *
   * The camera may only be recentered on the user when this is true. It is set
   * by the three actions the user can actually perform to ask for it:
   *   - the first locate after sign-in / sign-up,
   *   - the map's "find my location" button,
   *   - picking "Use my location" in the city dropdown.
   *
   * Everything else that produces a position fix — the Mapbox geolocate
   * control's continuous tracking watch, and our own background city
   * re-detection watcher — is passive. Passive fixes update the user marker
   * and the underlying coordinates, but must never move the camera, because
   * the user may be deliberately browsing another city.
   */
  const {
    recenterIntentRef,
    userMovedCameraRef,
    requestRecenter,
    consumeRecenterIntent,
  } = useMapRecenterPolicy();


  // Mirror selectedCity + onCityChange so the (one-time) geolocate handler
  // can sync the parent without re-subscribing on every prop change.
  const selectedCityRef = useRef(selectedCity);
  const onCityChangeRef = useRef(onCityChange);
  useEffect(() => {
    selectedCityRef.current = selectedCity;
  }, [selectedCity]);
  useEffect(() => {
    onCityChangeRef.current = onCityChange;
  }, [onCityChange]);


  /**
   * Always resolves a *fresh* position and pushes it through the shared
   * geolocation handler so the city selector label, detected city, and all
   * data filters follow where the user actually is. Falls back to a
   * network (IP/WiFi) fix when GPS is denied or times out, and finally to a
   * nearest-city sync so the dropdown never stays stale.
   *
   * Only ever called from an explicit user action (or the once-per-sign-in
   * locate), so it arms the recenter intent that permits a camera move.
   */
  const refreshCurrentLocation = useCallback(() => {
    requestRecenter();
    setIsUsingCurrentLocation(true);
    isUsingCurrentLocationRef.current = true;
    // Drop the previous fix so the selector never keeps showing the city the
    // user was on before asking to be located — it shows "Locating..." until
    // the fresh fix lands.

    setDetectedCity(null);
    setDetectedLocationName(null);

    const apply = (latitude: number, longitude: number) => {
      // Always sync the city from the fresh fix first, so the selector and all
      // data filters move even if the map handler is mid-teardown.
      const nearest = getNearestCity(latitude, longitude);
      setUserLocation({ lat: latitude, lng: longitude });
      setDetectedCity(nearest);
      setDetectedLocationName((prev) =>
        prev ?? `${nearest.name}, ${nearest.state}`,
      );
      if (nearest.id !== selectedCityRef.current.id)
        onCityChangeRef.current(nearest);
      if (applyGeolocationRef.current) {
        applyGeolocationRef.current({ latitude, longitude });
      }
    };

    const networkFallback = () => {
      import("@/lib/networkGeolocation")
        .then(({ getNetworkLocation }) => getNetworkLocation(true))
        .then((fix) => {
          if (fix) {
            apply(fix.lat, fix.lng);
          } else {
            // No fix at all — fall back to the city the user is on rather than
            // leaving the selector stuck on "Locating...".
            setIsUsingCurrentLocation(false);
            isUsingCurrentLocationRef.current = false;
          }
        })
        .catch(() => {
          setIsUsingCurrentLocation(false);
          isUsingCurrentLocationRef.current = false;
        });
    };

    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => apply(pos.coords.latitude, pos.coords.longitude),
        (err) => {
          console.warn("MapboxHeatmap: location refresh failed", err?.message);
          networkFallback();
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
      );
    } else {
      networkFallback();
    }

    // Also start/refresh the built-in puck when tracking is off.
    const control = geolocateControlRef.current as any;
    const watchState = control?._watchState;
    if (
      control &&
      (!watchState || watchState === "OFF" || watchState === "ACTIVE_ERROR")
    ) {
      try {
        control.trigger();
      } catch {
        /* control not ready */
      }
    }
  }, [requestRecenter]);


  // City selector search query
  const [citySearchQuery, setCitySearchQuery] = useState("");
  // Cities resolved from Mapbox when the query doesn't match the curated list.
  // Only populated after the user confirms with Enter (or the Go button).
  const [remoteCities, setRemoteCities] = useState<GeocodedCity[]>([]);
  const [isSearchingRemoteCity, setIsSearchingRemoteCity] = useState(false);
  const [remoteCitySearchTerm, setRemoteCitySearchTerm] = useState("");
  const remoteSearchAbortRef = useRef<AbortController | null>(null);

  /** Switch the map to an explicitly chosen city (curated or geocoded). */
  const selectCityAndFly = (city: City) => {
    setIsUsingCurrentLocation(false);
    isUsingCurrentLocationRef.current = false;
    recenterIntentRef.current = false;
    userMovedCameraRef.current = true;
    setDetectedLocationName(null);
    onCityChange(city);
    if (map.current) {
      map.current.flyTo({
        center: [city.lng, city.lat],
        zoom: city.zoom,
        duration: 1500,
        essential: true,
      });
    }
  };

  /**
   * Confirmed city search (Enter / Go). Prefers an exact curated match, then
   * falls back to Mapbox geocoding across major US cities.
   */
  const confirmCitySearch = async () => {
    const q = citySearchQuery.trim();
    if (!q) return;

    const lower = q.toLowerCase();
    const localMatch =
      CITIES.find((c) => `${c.name}, ${c.state}`.toLowerCase() === lower) ??
      CITIES.find((c) => c.name.toLowerCase() === lower) ??
      CITIES.find(
        (c) =>
          c.name.toLowerCase().startsWith(lower) ||
          `${c.name}, ${c.state}`.toLowerCase().includes(lower),
      );
    if (localMatch) {
      triggerHaptic("light");
      selectCityAndFly(localMatch);
      setCitySearchQuery("");
      setRemoteCities([]);
      return;
    }

    remoteSearchAbortRef.current?.abort();
    const controller = new AbortController();
    remoteSearchAbortRef.current = controller;
    setIsSearchingRemoteCity(true);
    setRemoteCitySearchTerm(q);
    const results = await searchUsCities(q, mapboxToken, 5, controller.signal);
    if (controller.signal.aborted) return;
    setIsSearchingRemoteCity(false);
    setRemoteCities(results);
    if (results.length === 1) {
      triggerHaptic("light");
      selectCityAndFly(results[0]);
      setCitySearchQuery("");
      setRemoteCities([]);
    }
  };




  /**
   * Automatic city re-detection while the app is open.
   *
   * Only runs while the user is in "current location" mode — a manual city
   * selection is never overridden. A new fix must be at least
   * RE_DETECT_MIN_METERS away from the last one we acted on before we
   * re-resolve the nearest city, so GPS jitter can't thrash the selector.
   *
   * This watcher is passive: it keeps the user's own coordinates and marker
   * fresh, but it never recenters the camera, and it will not switch the
   * selected city once the user has started browsing the map themselves
   * (switching cities flies the camera, which is the same yank by another
   * name). The moment they tap "find my location" the intent flag clears and
   * detection resumes.
   */

  const lastWatchFixRef = useRef<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    if (!isUsingCurrentLocation) {
      lastWatchFixRef.current = null;
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    const RE_DETECT_MIN_METERS = 2000;
    const distanceMeters = (
      a: { lat: number; lng: number },
      b: { lat: number; lng: number },
    ) => {
      const R = 6371000;
      const toRad = (v: number) => (v * Math.PI) / 180;
      const dLat = toRad(b.lat - a.lat);
      const dLng = toRad(b.lng - a.lng);
      const h =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
      return 2 * R * Math.asin(Math.sqrt(h));
    };

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        // Guard again at fire time: the user may have picked a city manually
        // between the subscription and this callback.
        if (!isUsingCurrentLocationRef.current) return;
        const { latitude, longitude, accuracy } = pos.coords;
        if (typeof accuracy === "number" && accuracy > 5000) return;
        const next = { lat: latitude, lng: longitude };
        const prev = lastWatchFixRef.current;
        if (prev && distanceMeters(prev, next) < RE_DETECT_MIN_METERS) return;
        lastWatchFixRef.current = next;

        const nearest = getNearestCity(latitude, longitude);
        setUserLocation(next);
        setDetectedCity(nearest);
        if (nearest.id !== selectedCityRef.current.id) {
          setDetectedLocationName(`${nearest.name}, ${nearest.state}`);
          // Only follow the user into a new city while they are not actively
          // looking at somewhere else — a city change triggers a camera fly.
          if (!userMovedCameraRef.current) {
            onCityChangeRef.current(nearest);
          }
        }
        // Passive fix: updates the marker/coordinates, never the camera.
        applyGeolocationRef.current?.({ latitude, longitude });

      },
      (err) => {
        console.warn("MapboxHeatmap: location watch failed", err?.message);
      },
      { enableHighAccuracy: false, timeout: 20000, maximumAge: 30000 },
    );

    return () => {
      try {
        navigator.geolocation.clearWatch(watchId);
      } catch {
        /* ignore */
      }
    };
  }, [isUsingCurrentLocation]);

  // Notify parent when detected location name changes
  useEffect(() => {
    if (onDetectedLocationNameChange) {
      if (isUsingCurrentLocation) {
        onDetectedLocationNameChange(detectedLocationName);
      } else {
        // When manually selecting a city, clear the detected name so parent uses selected city
        onDetectedLocationNameChange(null);
      }
    }
  }, [
    detectedLocationName,
    isUsingCurrentLocation,
    onDetectedLocationNameChange,
  ]);

  // Sync map style with theme changes
  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.attributeName === "class") {
          const isDark = document.documentElement.classList.contains("dark");
          setMapStyle((prev) => {
            // Only auto-switch if user hasn't manually picked satellite
            if (prev === "satellite") return prev;
            return isDark ? "dark" : "streets";
          });
        }
      }
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  // Reset UI state when tab changes (resetUIKey increments)
  useEffect(() => {
    if (resetUIKey !== undefined) {
      setControlsCollapsed(true);
      setLegendCollapsed(true);
    }
  }, [resetUIKey]);

  // Track tab visibility to pause animations when hidden (battery optimization)
  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsTabVisible(!document.hidden);
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  const {
    densityData,
    loading: densityLoading,
    error: densityError,
    unauthorized: densityUnauthorized,
    refresh: refreshDensity,
  } = useLocationDensity({
    timeFilter,
    hourOfDay: timelapseMode ? undefined : hourFilter,
    dayOfWeek: dayFilter,
    windowMinutes: heatWindowMinutes ?? undefined,
  });

  const {
    pathData,
    loading: pathsLoading,
    error: pathsError,
    unauthorized: pathsUnauthorized,
    refresh: refreshPaths,
  } = useMovementPaths({
    timeFilter: pathTimeFilter,
    minFrequency: minPathFrequency,
    windowMinutes: pathsWindowMinutes ?? undefined,
  });

  // Visual loading states for layer toggles so users see a clear refresh
  // whenever a data-backed layer is switched on or off.
  const [isLoadingHeatmap, setIsLoadingHeatmap] = useState(false);
  const [isLoadingPaths, setIsLoadingPaths] = useState(false);
  const [isLoadingStats, setIsLoadingStats] = useState(false);

  // Coalesce rapid toggle-triggered refreshes so consecutive on/off/on taps
  // don't cause a chain of loader flashes or redundant network requests.
  const densityRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const pathsRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const clearDensityRefreshTimer = useCallback(() => {
    if (densityRefreshTimerRef.current) {
      clearTimeout(densityRefreshTimerRef.current);
      densityRefreshTimerRef.current = null;
    }
  }, []);

  const clearPathsRefreshTimer = useCallback(() => {
    if (pathsRefreshTimerRef.current) {
      clearTimeout(pathsRefreshTimerRef.current);
      pathsRefreshTimerRef.current = null;
    }
  }, []);

  const scheduleDensityRefresh = useCallback(() => {
    clearDensityRefreshTimer();
    setIsLoadingHeatmap(true);
    densityRefreshTimerRef.current = setTimeout(() => {
      densityRefreshTimerRef.current = null;
      refreshDensity();
    }, 300);
  }, [clearDensityRefreshTimer, refreshDensity]);

  const schedulePathsRefresh = useCallback(() => {
    clearPathsRefreshTimer();
    setIsLoadingPaths(true);
    pathsRefreshTimerRef.current = setTimeout(() => {
      pathsRefreshTimerRef.current = null;
      refreshPaths();
    }, 300);
  }, [clearPathsRefreshTimer, refreshPaths]);

  // Clean up any pending coalesced refresh timers on unmount.
  useEffect(() => {
    return () => {
      clearDensityRefreshTimer();
      clearPathsRefreshTimer();
    };
  }, [clearDensityRefreshTimer, clearPathsRefreshTimer]);

  // As soon as the platform grants location permission (from the banner, the
  // permission prompt, or OS settings), recenter on the user and reload the
  // heat + flow layers so the map reflects their real position immediately.
  useEffect(() => {
    const onGranted = () => {
      refreshCurrentLocation();
      setIsLoadingStats(true);
      scheduleDensityRefresh();
      schedulePathsRefresh();
    };
    window.addEventListener(GEO_GRANTED_EVENT, onGranted);
    return () => window.removeEventListener(GEO_GRANTED_EVENT, onGranted);
  }, [refreshCurrentLocation, scheduleDensityRefresh, schedulePathsRefresh]);

  // Recenter on the user once per sign-in, but only when location is already
  // allowed — the map stays freely browsable (and on whatever city is
  // selected) for everyone else until they explicitly ask to be located.
  // The "already recentered" marker is persisted, because a plain reload or
  // remount must NOT count as a new sign-in (last_sign_in_at is unchanged).
  const { session: authSession } = useAuth();
  const signInKey = authSession?.user
    ? `${authSession.user.id}:${authSession.user.last_sign_in_at ?? ""}`
    : null;
  const SIGN_IN_RECENTER_KEY = "jet-recentered-for-sign-in";
  useEffect(() => {
    if (!signInKey) return;
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(SIGN_IN_RECENTER_KEY);
    } catch {
      // Storage may be unavailable; fall through and treat as not recentered.
    }
    if (stored === signInKey) return;
    if (typeof navigator === "undefined" || !navigator.permissions?.query)
      return;
    let cancelled = false;
    navigator.permissions
      .query({ name: "geolocation" as PermissionName })
      .then((status) => {
        if (cancelled || status.state !== "granted") return;
        try {
          window.localStorage.setItem(SIGN_IN_RECENTER_KEY, signInKey);
        } catch {
          // Best-effort persistence.
        }
        refreshCurrentLocation();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [signInKey, refreshCurrentLocation]);


  // Sync toggle-triggered loading states with hook loading so they stay visible
  // until the data fetch actually completes (including debounce / realtime).
  useEffect(() => {
    if (!densityLoading) setIsLoadingHeatmap(false);
  }, [densityLoading]);
  useEffect(() => {
    if (!pathsLoading) setIsLoadingPaths(false);
  }, [pathsLoading]);
  useEffect(() => {
    if (!densityLoading && !pathsLoading) setIsLoadingStats(false);
  }, [densityLoading, pathsLoading]);

  // Time-lapse hook (restore persisted speed)
  const initialTimelapseSpeed = useRef(getPersistedTimelapseSpeed());
  const timelapse = useHeatmapTimelapse(
    dayFilter,
    initialTimelapseSpeed.current,
  );

  // Persist timelapse playback speed
  useEffect(() => {
    localStorage.setItem(FILTER_KEYS.timelapseSpeed, String(timelapse.speed));
  }, [timelapse.speed]);

  // When day filter changes while time-lapse is active, reload the 24-hour
  // dataset so the animation reflects the new weekday slice.
  useEffect(() => {
    if (timelapseMode) timelapse.loadHourlyData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayFilter, timelapseMode]);

  // ── Unified layer-toggle intents ──────────────────────────────────────
  // Every surface that can flip a layer (Layers panel rows, collapsed
  // quick-toggle chips, the Time-lapse pill) routes through these so the
  // dependency cascade can never disagree between entry points.
  //
  // Rules:
  //   • Heatmap off  → Time-lapse off, Live Stats off (both feed off it).
  //   • Flow Paths on → Time-lapse off (they fight for the same channel).
  //   • Flow Paths off → Live Stats off (stats needs the paths series).
  //   • Live Stats on → Heatmap + Flow Paths on.
  //   • Time-lapse on → Heatmap on, Flow Paths off (⇒ Live Stats off).
  const {
    applyDensityLayer,
    applyPathsLayer,
    applyParkingLayer,
    applyLiveStats,
    applyTimelapse,
    handleResetToDefaults,
  } = useMapLayerToggles({
    mapRef: map,
    timelapse,
    filterKeys: FILTER_KEYS,
    setShowDensityLayer,
    setShowMovementPaths,
    setShowParking,
    setShowLiveStats,
    setTimelapseMode,
    setIsLoadingHeatmap,
    setIsLoadingPaths,
    setIsLoadingStats,
    setTimeFilter,
    setPathTimeFilter,
    setHourFilter,
    setDayFilter,
    setMinPathFrequency,
    setPathsWindowMinutes,
    scheduleDensityRefresh,
    clearDensityRefreshTimer,
    schedulePathsRefresh,
    clearPathsRefreshTimer,
  });

  // ── Scoped resets ─────────────────────────────────────────────────────
  // The heatmap no longer has its own reset button — the single "Reset to
  // defaults" action at the bottom of the Layers panel restores every
  // heatmap control (time range, day, time-lapse) along with the rest.

  // ── Live Stats quick actions ──────────────────────────────────────────
  // Derived "top hotspot" (max density grid cell) and "top route"
  // (max frequency movement path) for the current data window.
  const topHotspot = useMemo(() => {
    let best: Position | null = null;
    let bestDensity = -1;
    for (const f of featuresOf(densityData?.geojson)) {
      const d = numProp(f, "density");
      if (d <= bestDensity || f?.geometry?.type !== "Point") continue;
      const coords = pointCoords(f);
      if (!coords) continue;
      best = coords;
      bestDensity = d;
    }
    if (!best) return null;
    return { lng: best[0], lat: best[1], density: bestDensity };
  }, [densityData]);

  // ── Tap-to-inspect: heat cell details ────────────────────────────────
  const [inspectedCell, setInspectedCell] = useState<HeatCell | null>(null);
  // Measured height of the heat-cell inspector card; drives the chip offset so
  // the two never overlap regardless of wrapped copy or device width.
  const [inspectorHeight, setInspectorHeight] = useState(0);

  useEffect(() => {
    if (!showDensityLayer) setInspectedCell(null);
  }, [showDensityLayer]);

  useEffect(() => {
    const mapInstance = map.current;
    if (!mapInstance || !mapLoaded || !showDensityLayer) return;

    const handleHeatClick = (e: MapboxGL.MapMouseEvent) => {
      // Nearest grid cell within a finger-sized radius of the tap.
      const threshold = isMobile ? 44 : 32;
      let best: { coords: Position; feature: MapFeature } | null = null;
      let bestDist = Infinity;
      for (const feature of featuresOf(densityData?.geojson)) {
        const coords = pointCoords(feature);
        if (!coords) continue;
        const projected = mapInstance.project({
          lng: coords[0],
          lat: coords[1],
        });
        const dist = Math.hypot(
          projected.x - e.point.x,
          projected.y - e.point.y,
        );
        if (dist < bestDist) {
          bestDist = dist;
          best = { coords, feature };
        }
      }

      if (!best || bestDist > threshold) {
        setInspectedCell(null);
        return;
      }

      const [lng, lat] = best.coords;
      const density = numProp(best.feature, "density");
      triggerHaptic("light");
      setInspectedCell({
        lat,
        lng,
        density,
        intensity: numProp(
          best.feature,
          "intensity",
          Math.min(density / 10, 1),
        ),
      });
    };

    mapInstance.on("click", handleHeatClick);
    return () => {
      mapInstance.off("click", handleHeatClick);
    };
  }, [mapLoaded, showDensityLayer, densityData, isMobile]);

  const topRoute = useMemo(() => {
    let best: MapFeature | null = null;
    let bestFreq = -1;
    for (const f of featuresOf(pathData?.geojson)) {
      const freq = numProp(f, "frequency");
      if (
        freq > bestFreq &&
        f?.geometry?.type === "LineString" &&
        lineCoords(f).length > 0
      ) {
        best = f;
        bestFreq = freq;
      }
    }
    if (!best) return null;
    return { frequency: bestFreq, coordinates: lineCoords(best) };
  }, [pathData]);

  const handleJumpToHotspot = useCallback(() => {
    if (!topHotspot || !map.current) return;
    triggerHaptic("medium");
    try {
      map.current.flyTo({
        center: [topHotspot.lng, topHotspot.lat],
        zoom: Math.max(map.current.getZoom(), 15.25),
        duration: 1200,
        essential: true,
      });
    } catch {
      /* ignore */
    }
  }, [topHotspot]);

  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleHighlightTopRoute = useCallback(() => {
    if (!topRoute || !map.current) return;
    triggerHaptic("medium");
    const mapInstance = map.current;
    const srcId = "top-route-highlight-src";
    const layerId = "top-route-highlight-line";
    const glowId = "top-route-highlight-glow";

    const cleanup = () => {
      try {
        if (mapInstance.getLayer(layerId)) mapInstance.removeLayer(layerId);
      } catch {
        /*noop*/
      }
      try {
        if (mapInstance.getLayer(glowId)) mapInstance.removeLayer(glowId);
      } catch {
        /*noop*/
      }
      try {
        if (mapInstance.getSource(srcId)) mapInstance.removeSource(srcId);
      } catch {
        /*noop*/
      }
    };
    cleanup();

    try {
      mapInstance.addSource(srcId, {
        type: "geojson",
        data: {
          type: "Feature",
          properties: { frequency: topRoute.frequency },
          geometry: { type: "LineString", coordinates: topRoute.coordinates },
        },
      });
      mapInstance.addLayer({
        id: glowId,
        type: "line",
        source: srcId,
        layout: {
          "line-join": "round",
          "line-cap": "round",
          ...FLOW_LINE_ELEVATION_LAYOUT,
        },
        paint: {
          "line-color": "hsl(45, 100%, 60%)",
          "line-width": 22,
          "line-blur": 8,
          "line-opacity": 0.55,
          "line-occlusion-opacity": 0.3,
        },
      });
      mapInstance.addLayer({
        id: layerId,
        type: "line",
        source: srcId,
        layout: {
          "line-join": "round",
          "line-cap": "round",
          ...FLOW_LINE_ELEVATION_LAYOUT,
        },
        paint: {
          "line-color": "#FFD666",
          "line-width": 6,
          "line-opacity": 0.95,
          "line-occlusion-opacity": 0.5,
        },
      });

      // Fit the map to the route bounds.
      const coords = topRoute.coordinates;
      let minLng = coords[0][0],
        maxLng = coords[0][0];
      let minLat = coords[0][1],
        maxLat = coords[0][1];
      for (const [lng, lat] of coords) {
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
      try {
        mapInstance.fitBounds(
          [
            [minLng, minLat],
            [maxLng, maxLat],
          ],
          { padding: 80, duration: 1000, maxZoom: 15.5 },
        );
      } catch {
        /* ignore */
      }
    } catch {
      /* ignore */
    }

    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(cleanup, 6000);
  }, [topRoute]);

  useEffect(
    () => () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    },
    [],
  );

  // Handle map resize on viewport changes - optimized for all mobile devices
  useEffect(() => {
    let resizeTimeout: ReturnType<typeof setTimeout>;

    const handleResize = () => {
      // Debounce resize to prevent excessive calls during orientation changes
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        if (map.current) {
          map.current.resize();
          // Viewport class may have changed (rotation, split view, desktop
          // window resize) — keep label scaling in sync with it.
          applyMapScaleFactor(map.current, getMapScaleFactor());
        }
      }, 100);
    };

    // Handle iOS Safari address bar show/hide
    const handleVisualViewportResize = () => {
      if (map.current && window.visualViewport) {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
          map.current?.resize();
        }, 50);
      }
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);

    // Visual viewport API for iOS Safari dynamic viewport
    if (window.visualViewport) {
      window.visualViewport.addEventListener(
        "resize",
        handleVisualViewportResize,
      );
    }

    // Handle visibility changes (e.g., when switching tabs)
    const handleVisibilityChange = () => {
      if (!document.hidden && map.current) {
        setTimeout(() => map.current?.resize(), 100);
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Handle page focus for PWA and native apps
    const handleFocus = () => {
      if (map.current) {
        setTimeout(() => map.current?.resize(), 150);
      }
    };
    window.addEventListener("focus", handleFocus);

    return () => {
      clearTimeout(resizeTimeout);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener(
          "resize",
          handleVisualViewportResize,
        );
      }
    };
  }, []);

  // Keep the map camera + built-in controls clear of the header, bottom nav and open panels
  const paddingInitialisedRef = useRef(false);
  useEffect(() => {
    const root = document.documentElement;
    const panelOpen = !!(isMobile && selectedVenue);
    const focus =
      panelOpen &&
      Number.isFinite(selectedVenue?.lng) &&
      Number.isFinite(selectedVenue?.lat)
        ? ([selectedVenue!.lng, selectedVenue!.lat] as [number, number])
        : null;

    // Height reserved at the bottom by an open panel (JetCard / ParkingCard).
    // The page measures the real card via useMapPanelInset; this only supplies a
    // first-frame estimate before that measurement lands, and resets on close.
    const current = root.style.getPropertyValue("--map-panel-bottom").trim();
    const alreadyMeasured = panelOpen && current !== "" && current !== "0px";
    if (!alreadyMeasured) {
      root.style.setProperty(
        "--map-panel-bottom",
        panelOpen ? "min(46svh, 420px)" : "0px",
      );
    }

    const readPx = (expr: string) => {
      const probe = document.createElement("div");
      probe.style.cssText = `position:absolute;visibility:hidden;pointer-events:none;height:${expr}`;
      document.body.appendChild(probe);
      const px = probe.getBoundingClientRect().height;
      probe.remove();
      return Number.isFinite(px) ? px : 0;
    };

    let lastSignature = "";

    const applyPadding = (animate = true) => {
      if (!map.current) return;
      // Orientation flips change both the safe-area insets and the svh basis
      // used by --map-panel-bottom, so everything is re-measured from the DOM.
      const top = readPx("var(--map-safe-top-controls, var(--map-safe-top))");
      const bottom = readPx(
        "var(--map-safe-bottom-panels, var(--map-safe-bottom))",
      );
      const left = readPx("var(--map-ui-inset-left)");
      const right = readPx("var(--map-ui-inset-right)");
      const padding = {
        top: Math.round(top),
        bottom: Math.round(bottom),
        left: Math.round(left),
        right: Math.round(right),
      };
      const signature = `${padding.top}|${padding.bottom}|${padding.left}|${padding.right}|${window.innerWidth}x${window.innerHeight}`;
      if (signature === lastSignature) return;
      lastSignature = signature;
      try {
        // Canvas first: padding is meaningless against a stale canvas size.
        map.current.resize();
        const duration = animate ? 260 : 0;
        if (animate && focus) {
          // Single combined camera move: re-centring the venue inside the
          // shrunken viewport in the same animation avoids the double-hop
          // jitter of setPadding() followed by a separate easeTo().
          map.current.easeTo({
            center: focus,
            padding,
            duration,
            essential: true,
          } as never);
        } else {
          map.current.setPadding(padding, { duration } as never);
        }
      } catch {
        /* map not ready yet */
      }
    };

    // iOS/Android report stale viewport metrics for a few frames after a
    // rotation, so each trigger schedules a rAF pass plus delayed re-checks.
    let rafId = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const clearTimers = () => {
      timers.splice(0).forEach(clearTimeout);
    };

    const schedule = (animate = true) => {
      if (rafId) cancelAnimationFrame(rafId);
      clearTimers();
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        applyPadding(animate);
      });
      // Re-measure across the panel's own CSS transition so the final canvas
      // size and padding settle together instead of drifting after it ends.
      [120, 320, 600].forEach((delay) =>
        timers.push(setTimeout(() => applyPadding(animate), delay)),
      );
      timers.push(
        setTimeout(() => {
          try {
            map.current?.resize();
          } catch {
            /* noop */
          }
        }, 700),
      );
    };

    const onRotate = () => schedule(false);
    const onResize = () => schedule(true);
    const onResume = () => {
      if (document.visibilityState === "visible") schedule(false);
    };

    // First paint snaps; later panel open/close reflows animate smoothly.
    schedule(paddingInitialisedRef.current);
    paddingInitialisedRef.current = true;
    window.addEventListener("resize", onResize);
    // The page re-publishes --map-panel-bottom whenever a card resizes.
    window.addEventListener("jet:panel-metrics", onResize);
    window.addEventListener("orientationchange", onRotate);
    window.visualViewport?.addEventListener("resize", onResize);
    window.addEventListener("pageshow", onResume);
    document.addEventListener("visibilitychange", onResume);
    const screenOrientation = window.screen?.orientation;
    screenOrientation?.addEventListener?.("change", onRotate);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      clearTimers();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("jet:panel-metrics", onResize);
      window.removeEventListener("orientationchange", onRotate);
      window.visualViewport?.removeEventListener("resize", onResize);
      window.removeEventListener("pageshow", onResume);
      document.removeEventListener("visibilitychange", onResume);
      screenOrientation?.removeEventListener?.("change", onRotate);
    };
    // Depend on the panel's identity/state, not the venue object reference, so
    // unrelated re-renders never retrigger a camera move.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isMobile,
    selectedVenue?.id,
    selectedVenue?.lat,
    selectedVenue?.lng,
    mapLoaded,
  ]);

  // Reveal the selected venue while preserving the user's map context: zoom,
  // bearing and pitch are kept exactly as-is and the camera only pans when the
  // pin sits outside the padded viewport (e.g. a JetCard opened from Favorites).
  const revealedVenueRef = useRef<string | null>(null);
  useEffect(() => {
    const m = map.current;
    if (!m || !mapLoaded) return;
    const id = selectedVenue?.id ?? null;
    if (!id) {
      revealedVenueRef.current = null;
      return;
    }
    if (revealedVenueRef.current === id) return;
    const lat = selectedVenue?.lat;
    const lng = selectedVenue?.lng;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    revealedVenueRef.current = id;
    // Let the card's open transition (and the padding pass) settle first.
    const timer = setTimeout(() => {
      try {
        const point = m.project([lng as number, lat as number]);
        const pad = (m.getPadding?.() ?? {}) as {
          top?: number;
          bottom?: number;
          left?: number;
          right?: number;
        };
        const canvas = m.getCanvas();
        const margin = 56;
        const inView =
          point.x > (pad.left ?? 0) + margin &&
          point.x < canvas.clientWidth - (pad.right ?? 0) - margin &&
          point.y > (pad.top ?? 0) + margin &&
          point.y < canvas.clientHeight - (pad.bottom ?? 0) - margin;
        if (inView) return;
        m.easeTo({
          center: [lng as number, lat as number],
          zoom: m.getZoom(),
          bearing: m.getBearing(),
          pitch: m.getPitch(),
          duration: platformSettings.current.hasReducedMotion ? 0 : 700,
          essential: true,
        });
      } catch {
        /* map not ready */
      }
    }, 320);
    return () => clearTimeout(timer);
  }, [
    mapLoaded,
    selectedVenue?.id,
    selectedVenue?.lat,
    selectedVenue?.lng,
  ]);

  // Suspend map drag / scroll-zoom while the user interacts with an overlay
  // panel (JetCard, search results), and restore it when they leave/close it.
  useEffect(() => {
    if (!mapLoaded) return;
    return subscribeMapInteractionLock((locked) => {
      const m = map.current;
      if (!m) return;
      const handlers = [
        m.dragPan,
        m.scrollZoom,
        m.touchZoomRotate,
        m.doubleClickZoom,
        m.dragRotate,
        m.touchPitch,
        m.keyboard,
      ];
      handlers.forEach((h) => {
        try {
          if (locked) h?.disable();
          else h?.enable();
        } catch {
          /* handler unavailable */
        }
      });
    });
  }, [mapLoaded]);

  useEffect(
    () => () => {
      document.documentElement.style.removeProperty("--map-panel-bottom");
    },
    [],
  );

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    // Wait for mapbox-gl module to be loaded
    if (!mapboxLoaded || !mapboxglRef.current) return;

    // Validate token before initialization
    if (!mapboxToken || mapboxToken.trim() === "") {
      console.error("MapboxHeatmap: Invalid or missing Mapbox token");
      setMapInitializing(false);
      return;
    }

    const mapboxgl = mapboxglRef.current;

    // Defer map initialization to reduce main thread blocking during initial load
    const initializeMap = () => {
      if (!mapContainer.current || map.current || !mapboxglRef.current) return;

      try {
        initStartTime.current = performance.now();
        setMapInitializing(true);
        mapboxgl.accessToken = mapboxToken;
        devLog("MapboxHeatmap: Initializing map for", selectedCity.name);

        const settings = platformSettings.current;

        // Initialize map centered on selected city with platform-specific optimizations
        // Using Mapbox Standard Style for enhanced 3D buildings, dynamic lighting, and performance
        map.current = new mapboxgl.Map({
          container: mapContainer.current,
          style:
            mapStyle === "dark"
              ? "mapbox://styles/mapbox/dark-v11"
              : mapStyle === "light"
                ? "mapbox://styles/mapbox/light-v11"
                : mapStyle === "satellite"
                  ? "mapbox://styles/mapbox/satellite-streets-v12"
                  : "mapbox://styles/mapbox/streets-v12",
          center: [selectedCity.lng, selectedCity.lat],
          zoom: selectedCity.zoom,
          pitch: settings.pitch,
          bearing: 0,
          antialias: settings.antialias,
          attributionControl: false,
          cooperativeGestures: settings.cooperativeGestures,
          touchZoomRotate: settings.touchZoomRotate,
          touchPitch: settings.touchPitch,
          dragRotate: settings.dragRotate,
          doubleClickZoom: true,
          projection: "globe",
          // Performance optimizations - reduce tile loading
          fadeDuration: settings.fadeDuration,
          refreshExpiredTiles: false,
          maxTileCacheSize: settings.maxTileCacheSize,
          trackResize: false,
          renderWorldCopies: !isMobile,
          // Zoom constraints to limit tile requests
          minZoom: settings.minZoom,
          maxZoom: settings.maxZoom,
          // Disable resource timing for performance
          collectResourceTiming: false,
          // Font optimization: Use system fonts for CJK/ideograph characters
          // This reduces font glyph requests by ~100KB+
          localIdeographFontFamily:
            "'Noto Sans', 'Noto Sans CJK SC', sans-serif",
          // Reduce font loading by using local font stack for labels
          // This saves loading DIN Pro fonts from Mapbox CDN
          localFontFamily:
            "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        });

        // Scale label/icon rendering up on phones so street, POI and venue
        // labels stay readable at arm's length (Mapbox GL JS >= 3.19).
        applyMapScaleFactor(map.current);

        // No attribution/logo control is added: the map keeps a clean bottom
        // edge so overlays align to the nav footer padding.

        // Adds the custom neon "P" parking icon + symbol layer.
        // Must run on EVERY style load: setStyle() wipes custom images/layers,
        // which is why parking icons disappeared on the light/streets basemaps.
        const ensureParkingLayer = () => {
          if (!map.current) return;
          try {
            if (!map.current.hasImage("jet-parking-p")) {
              const size = 96;
              const canvas = document.createElement("canvas");
              canvas.width = size;
              canvas.height = size;
              const ctx = canvas.getContext("2d");
              if (ctx) {
                const c = size / 2;
                // Outer soft glow (green halo)
                const glow = ctx.createRadialGradient(c, c, c * 0.5, c, c, c);
                glow.addColorStop(0, "rgba(57,255,20,0.28)");
                glow.addColorStop(1, "rgba(57,255,20,0)");
                ctx.fillStyle = glow;
                ctx.beginPath();
                ctx.arc(c, c, c, 0, Math.PI * 2);
                ctx.fill();

                // Frosted glass disc — translucent dark base with a light sheen
                const r = c - 10;
                ctx.beginPath();
                ctx.arc(c, c, r, 0, Math.PI * 2);
                ctx.fillStyle = "rgba(10,10,10,0.55)";
                ctx.fill();

                const sheen = ctx.createLinearGradient(
                  c - r,
                  c - r,
                  c + r,
                  c + r,
                );
                sheen.addColorStop(0, "rgba(255,255,255,0.30)");
                sheen.addColorStop(0.45, "rgba(255,255,255,0.06)");
                sheen.addColorStop(1, "rgba(57,255,20,0.16)");
                ctx.beginPath();
                ctx.arc(c, c, r, 0, Math.PI * 2);
                ctx.fillStyle = sheen;
                ctx.fill();

                // Hairline glass rim + green accent ring
                ctx.beginPath();
                ctx.arc(c, c, r, 0, Math.PI * 2);
                ctx.lineWidth = 2;
                ctx.strokeStyle = "rgba(255,255,255,0.35)";
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(c, c, r + 3.5, 0, Math.PI * 2);
                ctx.lineWidth = 3;
                ctx.strokeStyle = "rgba(57,255,20,0.85)";
                ctx.stroke();

                // Top highlight arc for the glass curvature
                ctx.beginPath();
                ctx.arc(c, c, r - 4, Math.PI * 1.15, Math.PI * 1.85);
                ctx.lineWidth = 3;
                ctx.strokeStyle = "rgba(255,255,255,0.28)";
                ctx.stroke();

                // "P" glyph
                ctx.fillStyle = "#39ff14";
                ctx.font =
                  "bold 52px system-ui, -apple-system, Arial, sans-serif";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.shadowColor = "rgba(57,255,20,0.75)";
                ctx.shadowBlur = 10;
                ctx.fillText("P", c, c + 2);
                ctx.shadowBlur = 0;
                map.current.addImage(
                  "jet-parking-p",
                  {
                    width: size,
                    height: size,
                    data: ctx.getImageData(0, 0, size, size).data,
                  },
                  { pixelRatio: 3 },
                );
              }
            }

            if (map.current.getLayer("parking-icons")) {
              map.current.setLayoutProperty(
                "parking-icons",
                "visibility",
                showParkingRef.current ? "visible" : "none",
              );
              return;
            }

            // Some styles (satellite) may not expose the composite POI source
            if (!map.current.getSource("composite")) return;

            map.current.addLayer({
              id: "parking-icons",
              type: "symbol",
              source: "composite",
              "source-layer": "poi_label",
              filter: [
                "any",
                ["==", ["get", "maki"], "parking"],
                ["==", ["get", "maki"], "parking-garage"],
              ],
              layout: {
                "icon-image": "jet-parking-p",
                "icon-size": [
                  "interpolate",
                  ["linear"],
                  ["zoom"],
                  10,
                  0.7,
                  12,
                  0.85,
                  14,
                  1.05,
                  16,
                  1.3,
                  18,
                  1.6,
                ],
                "icon-allow-overlap": true,
                "icon-ignore-placement": false,
                "text-field": ["step", ["zoom"], "", 13, ["get", "name"]],
                "text-font": ["DIN Pro Medium", "Arial Unicode MS Regular"],
                "text-size": 11,
                "text-offset": [0, 1.3],
                "text-anchor": "top",
                "text-optional": true,
                visibility: showParkingRef.current ? "visible" : "none",
              },
              paint: {
                "icon-opacity": [
                  "interpolate",
                  ["linear"],
                  ["zoom"],
                  10,
                  0.85,
                  11,
                  0.95,
                  12,
                  1,
                ],
                "text-color": "#39ff14",
                "text-halo-color": "#0a0a0a",
                "text-halo-width": 2,
              },
              minzoom: 10,
            });
            devLog("MapboxHeatmap: Parking icons layer added");
          } catch (e) {
            console.warn("MapboxHeatmap: Could not add parking layer:", e);
          }
        };

        // Add atmospheric effects and configure Standard style when loaded
        map.current.on("style.load", () => {
          if (!map.current) return;
          // Re-apply the custom parking layer after any basemap style swap
          ensureParkingLayer();
          // Basemap swaps rebuild symbol layers — re-assert the scale factor.
          applyMapScaleFactor(map.current);

          // Configure Standard style with dynamic lighting and native POI markers
          // Standard style includes built-in 3D buildings, landmarks, POI icons, and dynamic lighting
          try {
            // Set the light preset for dynamic lighting (dawn, day, dusk, night)
            map.current.setConfigProperty("basemap", "lightPreset", "night");

            // Enable native POI markers and labels (Standard style feature)
            map.current.setConfigProperty(
              "basemap",
              "showPointOfInterestLabels",
              true,
            );
            map.current.setConfigProperty("basemap", "showTransitLabels", true);
            map.current.setConfigProperty("basemap", "showPlaceLabels", true);
            map.current.setConfigProperty("basemap", "showRoadLabels", true);

            // Enable 3D landmark icons for enhanced visual experience
            map.current.setConfigProperty("basemap", "showLandmarkIcons", true);

            // Configure POI density and styling
            map.current.setConfigProperty("basemap", "theme", "default");
          } catch (e) {
            // Config properties may not be available in all style versions
            devLog("Standard style config not fully available:", e);
          }

          // Dynamic fog based on light preset for atmospheric depth
          const fogConfig = {
            color: "rgb(10, 10, 15)",
            "high-color": "rgb(30, 20, 40)",
            "horizon-blend": 0.05,
            "space-color": "rgb(5, 5, 10)",
            "star-intensity": 0.2,
          };

          map.current.setFog(fogConfig);

          // Note: 3D terrain source removed - requires Mapbox account with terrain access
          // If you have terrain access, uncomment the following:
          // if (!map.current.getSource('mapbox-dem')) {
          //   map.current.addSource('mapbox-dem', {
          //     type: 'raster-dem',
          //     url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
          //     tileSize: 512,
          //     maxzoom: 14,
          //   });
          //   map.current.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 });
          // }
        });

        // Add navigation controls
        map.current.addControl(
          new mapboxgl.NavigationControl({
            visualizePitch: true,
          }),
          "top-right",
        );

        // Configure touchZoomRotate handler for smoother pinch-to-zoom on mobile
        if (map.current.touchZoomRotate) {
          // Disable rotation during pinch (zoom only) for more predictable behavior
          map.current.touchZoomRotate.disableRotation();
        }

        // Enable scroll zoom with smooth animation
        map.current.scrollZoom.enable();
        map.current.scrollZoom.setWheelZoomRate(1 / 200); // Smoother wheel zoom

        // Add geolocate control with location change handler.
        // Guard against environments without the Geolocation API (some
        // Android WebViews, iframe previews with permissions stripped) — the
        // Mapbox control logs a noisy warning when navigator.geolocation is
        // unavailable and the button is non-functional anyway. We still attempt
        // to add the control whenever the API is present so the user location
        // marker stays active in preview/iframe contexts that grant permission.
        const hasGeolocation =
          typeof navigator !== "undefined" &&
          typeof navigator.geolocation !== "undefined" &&
          typeof navigator.geolocation.getCurrentPosition === "function";
        const geolocateControl = hasGeolocation
          ? new mapboxgl.GeolocateControl({
              positionOptions: { enableHighAccuracy: true },
              trackUserLocation: true,
              showUserHeading: true,
              showUserLocation: false, // Hide default marker, we'll use custom
            })
          : null;

        geolocateControlRef.current = geolocateControl;
        if (geolocateControl) {
          map.current.addControl(geolocateControl, "top-right");
          // Tapping the control's button is the "find my location" gesture, and
          // is the only geolocate path from this control that may move the
          // camera. Its subsequent tracking updates are passive.
          const geolocateButton = (geolocateControl as any)._geolocateButton as
            | HTMLElement
            | undefined;
          geolocateButton?.addEventListener("click", () => {
            requestRecenter();
            setIsUsingCurrentLocation(true);
            isUsingCurrentLocationRef.current = true;
          });
          // Swallow the Mapbox "Geolocation support is not available" warning
          // in iframe/permission-limited environments without breaking the map.
          geolocateControl.on("error", (e: any) => {
            console.warn(
              "MapboxHeatmap: Geolocation control error (non-fatal):",
              e?.message || e,
            );
          });
        }

        // Track deliberate camera movement. While the user is panning/zooming
        // around — including into another city — no passive position fix is
        // allowed to pull them back or switch the selected city.
        const markUserCameraMove = (e: any) => {
          if (e?.originalEvent) userMovedCameraRef.current = true;
        };
        map.current.on("dragstart", markUserCameraMove);
        map.current.on("zoomstart", markUserCameraMove);
        map.current.on("rotatestart", markUserCameraMove);


        // Create custom marker element for user location
        const createUserMarker = () => {
          const el = document.createElement("div");
          el.className = "user-location-marker";
          el.style.width = "64px";
          el.style.height = "64px";
          el.style.display = "flex";
          el.style.alignItems = "center";
          el.style.justifyContent = "center";
          el.style.position = "relative";
          // Note: No CSS transition on transform - Mapbox handles marker positioning
          // and transitions would cause visual lag during map pan/zoom

          // Glassmorphic puck container - visible frosted glass circle
          const glassPuck = document.createElement("div");
          glassPuck.style.position = "absolute";
          glassPuck.style.width = "100%";
          glassPuck.style.height = "100%";
          glassPuck.style.borderRadius = "50%";
          glassPuck.style.overflow = "hidden";
          glassPuck.style.background =
            "linear-gradient(135deg, rgba(255, 255, 255, 0.15) 0%, rgba(255, 255, 255, 0.05) 100%)";
          glassPuck.style.backdropFilter = "blur(12px) saturate(180%)";
          (glassPuck.style as any).WebkitBackdropFilter =
            "blur(12px) saturate(180%)";
          glassPuck.style.border = "1px solid rgba(255, 255, 255, 0.2)";
          glassPuck.style.boxShadow =
            "0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2), 0 0 20px rgba(255, 69, 58, 0.3)";
          glassPuck.style.display = "flex";
          glassPuck.style.alignItems = "center";
          glassPuck.style.justifyContent = "center";

          const img = document.createElement("img");
          img.src = locationPuckIcon;
          img.width = 32;
          img.height = 32;
          img.style.width = "70%";
          img.style.height = "70%";
          img.style.objectFit = "contain";
          img.style.filter = "drop-shadow(0 2px 8px rgba(0, 0, 0, 0.5))";

          glassPuck.appendChild(img);
          el.appendChild(glassPuck);
          return el;
        };

        // Track if this is the initial geolocate (for auto-centering on load)
        let isInitialGeolocate = true;

        // Store current marker position for smooth interpolation
        let currentMarkerPos: { lng: number; lat: number } | null = null;
        let animationFrameId: number | null = null;

        // Smooth position interpolation function
        const animateMarkerTo = (
          targetLng: number,
          targetLat: number,
          duration: number = 300,
        ) => {
          if (!userMarker.current || !currentMarkerPos) {
            // First position - set immediately
            currentMarkerPos = { lng: targetLng, lat: targetLat };
            userMarker.current?.setLngLat([targetLng, targetLat]);
            return;
          }

          // Cancel any existing animation
          if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
          }

          const startPos = { ...currentMarkerPos };
          const startTime = performance.now();

          const animate = (currentTime: number) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Ease-out cubic for smooth deceleration
            const easeOut = 1 - Math.pow(1 - progress, 3);

            const lng = startPos.lng + (targetLng - startPos.lng) * easeOut;
            const lat = startPos.lat + (targetLat - startPos.lat) * easeOut;

            userMarker.current?.setLngLat([lng, lat]);
            currentMarkerPos = { lng, lat };

            if (progress < 1) {
              animationFrameId = requestAnimationFrame(animate);
            } else {
              animationFrameId = null;
            }
          };

          animationFrameId = requestAnimationFrame(animate);
        };

        // Listen for geolocate events to update city and marker.
        // The control may not exist in environments without Geolocation
        // (handled above), so guard the listener wiring.
        const handleGeolocation = (coords: {
          latitude: number;
          longitude: number;
        }) => {
          const { longitude, latitude } = coords;

          // Update user location state
          setUserLocation({ lat: latitude, lng: longitude });

          // Find the nearest predefined city using proper Haversine distance (for filtering)
          const nearestCity = getNearestCity(latitude, longitude);

          // Store last known location for tile prefetching on next visit
          storeLastKnownLocation(latitude, longitude, nearestCity.name);

          // Set detected city based on location (used for data filtering)
          setDetectedCity(nearestCity);

          // Perform reverse geocoding to get actual city/metro name
          getCachedReverseGeocode(latitude, longitude, mapboxToken).then(
            (geocoded) => {
              if (geocoded) {
                setDetectedLocationName(geocoded.fullName);
              } else {
                // Fall back to nearest predefined city name
                setDetectedLocationName(
                  `${nearestCity.name}, ${nearestCity.state}`,
                );
              }
            },
          );

          // Notify parent of detected city on initial geolocate (auto-select nearest city),
          // but never override a city the user explicitly picked.
          if (
            isInitialGeolocate &&
            isUsingCurrentLocationRef.current &&
            onNearestCityDetected
          ) {
            onNearestCityDetected(nearestCity);
          }

          // The Mapbox geolocate control keeps a watch running once it has been
          // triggered, so it emits a `geolocate` event on every position update.
          // Those are passive — only a pending explicit request (find-my-location
          // button, "Use my location", first locate after sign-in) may move the
          // camera or flip the mode back to current-location.
          const userInitiatedRecenter = consumeRecenterIntent();
          if (userInitiatedRecenter) {
            setIsUsingCurrentLocation(true);
            isUsingCurrentLocationRef.current = true;
            userMovedCameraRef.current = false;
          }

          // Keep the parent's selectedCity in sync with the nearest detected city
          // so data filters (deals, density, paths) match the user's location.
          // Skipped while the user is browsing elsewhere, since a city change
          // flies the camera.
          if (
            (userInitiatedRecenter ||
              (isUsingCurrentLocationRef.current &&
                !userMovedCameraRef.current)) &&
            nearestCity.id !== selectedCityRef.current.id
          ) {
            onCityChangeRef.current(nearestCity);
          }

          // Camera moves happen only on the very first locate of the session or
          // when the user explicitly asked to be taken to their location.
          if (isInitialGeolocate && map.current) {
            isInitialGeolocate = false;
            if (!userMovedCameraRef.current) {
              map.current.flyTo({
                center: [longitude, latitude],
                zoom: Math.max(map.current.getZoom(), 13),
                duration: 1500,
                essential: true,
              });
            }
          } else if (userInitiatedRecenter && map.current) {
            // The user explicitly asked for "Current location" (possibly after
            // manually picking another city) — always recenter on the fresh fix
            // so the camera matches the newly synced city.
            map.current.flyTo({
              center: [longitude, latitude],
              zoom: Math.max(map.current.getZoom(), 13),
              duration: 1200,
              essential: true,
            });
          }


          // Create or update user marker with smooth interpolation
          if (!userMarker.current && map.current && mapboxglRef.current) {
            userMarker.current = new mapboxglRef.current.Marker({
              element: createUserMarker(),
              anchor: "bottom",
            })
              .setLngLat([longitude, latitude])
              .addTo(map.current);
            currentMarkerPos = { lng: longitude, lat: latitude };
          } else if (userMarker.current) {
            // Smoothly animate to new position
            animateMarkerTo(longitude, latitude, 400);
          }
        };

        applyGeolocationRef.current = handleGeolocation;
        geolocateControl?.on("geolocate", (e: any) =>
          handleGeolocation(e.coords),
        );

        // Remove marker when tracking stops
        geolocateControl?.on("trackuserlocationend", () => {
          if (userMarker.current) {
            userMarker.current.remove();
            userMarker.current = null;
          }
        });

        // Helper to finalize map loading state - called as early as possible for fast LCP
        const finalizeMapLoad = () => {
          if (map.current && mapInitializing) {
            map.current.resize();
            setMapLoaded(true);
            setMapInitializing(false);
            setLoadingStage("ready");
          }
          // Unblocks deferred, non-critical work (permission prompts, idle
          // prefetch) now that the above-the-fold hero has actually rendered.
          markMapPainted();
          // Tiles are in: clear any pending backoff state.
          tileRetry.current?.notifySuccess();
        };

        // Ensure map resizes to container after initialization
        map.current.on("load", () => {
          const loadTime = performance.now() - initStartTime.current;
          devLog(
            `MapboxHeatmap: Map loaded successfully in ${loadTime.toFixed(2)}ms`,
          );

          // Finalize immediately for fastest LCP
          finalizeMapLoad();

          // Close any open venue chip on off-map taps (background click).
          // Marker clicks call stopPropagation, so this only fires for empty map taps.
          map.current?.on("click", () => {
            activeChipRef.current?.hide();
          });

          // Ensure parking icons exist (also re-applied on every style change)
          if (map.current) {
            ensureParkingLayer();

            // One-time interactions for the parking layer (persist across style swaps)
            map.current.on("click", "parking-icons", (e) => {
              if (!e.features || e.features.length === 0) return;
              const feature = e.features[0] as MapboxGL.MapboxGeoJSONFeature;
              const coords = ((feature as any).geometry as any).coordinates;
              const parkingName =
                (feature as any).properties?.name || "Parking";

              triggerHaptic("medium");
              onParkingSelectRef.current?.({
                lat: coords[1],
                lng: coords[0],
                name: parkingName,
              });
            });

            map.current.on("mouseenter", "parking-icons", () => {
              if (map.current) map.current.getCanvas().style.cursor = "pointer";
            });
            map.current.on("mouseleave", "parking-icons", () => {
              if (map.current) map.current.getCanvas().style.cursor = "";
            });
          }

          // Trigger geolocation quickly after load
          if (geolocateControlRef.current) {
            setTimeout(() => {
              geolocateControlRef.current?.trigger();
            }, 100);
          }
        });

        // Fallback: style.load fires earlier and more reliably on some browsers
        // Use this for early LCP - finalize immediately when style is ready
        map.current.once("style.load", () => {
          devLog("MapboxHeatmap: Style loaded");
          // Finalize quickly if main load hasn't fired yet
          setTimeout(() => {
            if (mapInitializing && map.current) {
              devLog("MapboxHeatmap: Finalizing via style.load fallback");
              finalizeMapLoad();
            }
          }, 100);
        });

        // Fallback: idle event fires when map is completely ready
        map.current.once("idle", () => {
          if (mapInitializing && map.current) {
            devLog("MapboxHeatmap: Finalizing via idle fallback");
            finalizeMapLoad();
          }
        });

        // Track tile loading (stage indicator only)
        map.current.on("dataloading", () => {
          setLoadingStage((prev) => (prev === "init" ? "style" : prev));
        });

        // Add error handler with retry tracking
        let errorCount = 0;
        const maxErrors = 5;

        // Transient tile/network failures are retried automatically with
        // exponential backoff (and immediately when the browser comes back
        // online) before we ever show a connection error to the user.
        tileRetry.current?.dispose();
        tileRetry.current = createTileRetryController(map.current, {
          onRetry: (attempt, delayMs) =>
            devLog(
              `MapboxHeatmap: retrying tiles (attempt ${attempt}) in ${delayMs}ms`,
            ),
          onRecovered: () => {
            errorCount = 0;
            setMapError(null);
            devLog("MapboxHeatmap: tiles recovered after retry");
          },
          onExhausted: () => {
            setMapError(
              "Failed to load map tiles. Please check your connection.",
            );
            setMapInitializing(false);
          },
        });

        map.current.on("error", (e) => {
          const err: any = (e as any)?.error;
          const status = err?.status ?? err?.statusCode;
          const url = err?.url ?? err?.resource ?? err?.request?.url;

          console.error("MapboxHeatmap: Map error", err);

          // If the Mapbox token is URL-restricted, production domains often get 401/403 for api.mapbox.com
          if (
            (status === 401 || status === 403) &&
            typeof url === "string" &&
            url.includes("api.mapbox.com")
          ) {
            setMapError(
              "Mapbox token is not authorized for this domain. Update your Mapbox token URL restrictions to include this site.",
            );
            setMapInitializing(false);
            return;
          }

          // Style/layer validation errors are our own config bugs, not a
          // connectivity problem — they must never surface the "check your
          // connection" banner or block the map from showing.
          const message: string = err?.message ?? "";
          const isNetworkError =
            typeof status === "number" ||
            typeof url === "string" ||
            /network|fetch|timeout|tile/i.test(message);
          if (!isNetworkError) return;

          // Let the retry controller absorb transient failures.
          if (tileRetry.current?.handleError(err)) return;

          errorCount++;

          // If too many errors occur during loading, show error state
          if (errorCount >= maxErrors && !mapLoaded) {
            setMapError(
              "Failed to load map tiles. Please check your connection.",
            );
            setMapInitializing(false);
          }
        });

        // Timeout fallback - if map doesn't load within 15 seconds, show an actionable error
        // Reduced from 30s for better UX - users shouldn't wait forever
        const loadTimeout = setTimeout(() => {
          if (!mapLoaded && mapInitializing) {
            if (map.current) {
              // Final attempt: resize, then verify we truly have a loaded style
              map.current.resize();

              const isActuallyLoaded =
                (map.current as any).loaded?.() === true ||
                (typeof (map.current as any).isStyleLoaded === "function" &&
                  map.current.isStyleLoaded());

              if (isActuallyLoaded) {
                devLog("MapboxHeatmap: Map was actually loaded, finalizing");
                finalizeMapLoad();
              } else {
                console.warn(
                  "MapboxHeatmap: Map load timeout - silently retrying",
                );
                // Check for WebGL support - only show error for hard failures
                const canvas = document.createElement("canvas");
                const gl =
                  canvas.getContext("webgl") ||
                  canvas.getContext("experimental-webgl");
                if (!gl) {
                  setMapError(
                    "WebGL is not supported or disabled. Please enable it in your browser settings.",
                  );
                  setMapInitializing(false);
                } else {
                  // Silent retry instead of showing error overlay
                  devLog("MapboxHeatmap: Auto-retrying map load...");
                  setMapInitializing(false);
                  setTimeout(() => {
                    setMapError(null);
                    setMapInitializing(true);
                    setLoadingStage("module");
                    mapboxLoadPromise = null;
                    setRetryCount((c) => c + 1);
                  }, 1000);
                }
              }
            } else {
              setMapError(
                "Map failed to initialize. Please refresh and try again.",
              );
              setMapInitializing(false);
            }
          }
        }, 15000);

        map.current.once("load", () => {
          clearTimeout(loadTimeout);
        });
      } catch (error) {
        console.error("MapboxHeatmap: Failed to initialize map", error);
        setMapError("Failed to initialize map. Please try again.");
        setMapInitializing(false);
      }
    };

    // Defer map initialization until AFTER first paint so the heavy synchronous
    // `new mapboxgl.Map(...)` call (which can block the main thread for 200-600ms
    // creating WebGL context, parsing style JSON, building workers) never delays
    // FCP/LCP on the root route. Sequence:
    //   1. Two RAFs → guarantees the browser has committed at least one paint
    //   2. requestIdleCallback → yield to any pending input/layout work
    //   3. Fallback setTimeout(120) for browsers without rIC (Safari)
    let cancelled = false;
    let idleHandle: number | null = null;
    let rafHandle1 = 0;
    let rafHandle2 = 0;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    const scheduleInit = () => {
      if (cancelled) return;
      const ric: any = window.requestIdleCallback;
      if (typeof ric === "function") {
        idleHandle = ric(
          () => {
            if (!cancelled) initializeMap();
          },
          { timeout: 800 },
        );
      } else {
        timeoutHandle = setTimeout(() => {
          if (!cancelled) initializeMap();
        }, 120);
      }
    };
    rafHandle1 = requestAnimationFrame(() => {
      rafHandle2 = requestAnimationFrame(scheduleInit);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafHandle1);
      cancelAnimationFrame(rafHandle2);
      if (idleHandle != null && window.cancelIdleCallback) {
        window.cancelIdleCallback(idleHandle);
      }
      if (timeoutHandle) clearTimeout(timeoutHandle);
      cleanupMap();
    };

    function cleanupMap() {
      setMapLoaded(false);
      setMapError(null);
      tileRetry.current?.dispose();
      tileRetry.current = null;
      if (userMarker.current) {
        userMarker.current.remove();
      }
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      markerIndexRef.current.forEach((marker) => marker.remove());
      markerIndexRef.current = new Map();
      markerPassRef.current++;
      dealMarkersRef.current.forEach((marker) => marker.remove());
      map.current?.remove();
      map.current = null;
    }

    return () => {
      cleanupMap();
    };
  }, [mapboxToken, mapboxLoaded, retryCount]);
  // NOTE: the city fly-to lives in a single effect further below so the camera
  // isn't animated twice (which stranded markers at an intermediate zoom).

  // Handle map style changes
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const styleUrls: Record<string, string> = {
      light: "mapbox://styles/mapbox/light-v11",
      dark: "mapbox://styles/mapbox/dark-v11",
      streets: "mapbox://styles/mapbox/streets-v12",
      satellite: "mapbox://styles/mapbox/satellite-streets-v12",
    };

    map.current.setStyle(styleUrls[mapStyle]);
  }, [mapStyle, mapLoaded]);

  // Handle dynamic lighting preset changes with smooth animated transitions
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const mapInstance = map.current;

    // Fog configurations for each light preset
    const fogConfigs: Record<
      string,
      {
        color: string;
        highColor: string;
        horizonBlend: number;
        spaceColor: string;
        starIntensity: number;
      }
    > = {
      dawn: {
        color: "rgb(255, 200, 150)",
        highColor: "rgb(200, 150, 120)",
        horizonBlend: 0.08,
        spaceColor: "rgb(50, 30, 40)",
        starIntensity: 0.05,
      },
      day: {
        color: "rgb(220, 230, 240)",
        highColor: "rgb(180, 200, 230)",
        horizonBlend: 0.1,
        spaceColor: "rgb(100, 150, 200)",
        starIntensity: 0,
      },
      dusk: {
        color: "rgb(180, 100, 80)",
        highColor: "rgb(120, 80, 100)",
        horizonBlend: 0.08,
        spaceColor: "rgb(30, 20, 40)",
        starIntensity: 0.1,
      },
      night: {
        color: "rgb(10, 10, 15)",
        highColor: "rgb(30, 20, 40)",
        horizonBlend: 0.05,
        spaceColor: "rgb(5, 5, 10)",
        starIntensity: 0.2,
      },
    };

    // Helper to parse RGB string to array
    const parseRgb = (rgb: string): [number, number, number] => {
      const match = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (match) {
        return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
      }
      return [0, 0, 0];
    };

    // Helper to interpolate between two RGB colors
    const lerpRgb = (
      from: [number, number, number],
      to: [number, number, number],
      t: number,
    ): string => {
      const r = Math.round(from[0] + (to[0] - from[0]) * t);
      const g = Math.round(from[1] + (to[1] - from[1]) * t);
      const b = Math.round(from[2] + (to[2] - from[2]) * t);
      return `rgb(${r}, ${g}, ${b})`;
    };

    // Helper to interpolate between two numbers
    const lerp = (from: number, to: number, t: number): number => {
      return from + (to - from) * t;
    };

    // Easing function for smooth animation
    const easeInOutCubic = (t: number): number => {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    };

    try {
      // Apply the light preset for dynamic lighting (instant, handled by Mapbox)
      if (!mapInstance.isStyleLoaded?.()) return;
      mapInstance.setConfigProperty("basemap", "lightPreset", lightPreset);

      // Get current fog state (approximate from previous preset or default to night)
      const targetConfig = fogConfigs[lightPreset];

      // Animate fog transition over 1.5 seconds
      const duration = 1500;
      const startTime = performance.now();
      let animationFrame: number;

      // Get starting values (we'll interpolate from current state)
      const currentFog = mapInstance.getFog();
      const startColor = currentFog?.color
        ? parseRgb(currentFog.color as string)
        : parseRgb(fogConfigs.night.color);
      const startHighColor = currentFog?.["high-color"]
        ? parseRgb(currentFog["high-color"] as string)
        : parseRgb(fogConfigs.night.highColor);
      const startSpaceColor = currentFog?.["space-color"]
        ? parseRgb(currentFog["space-color"] as string)
        : parseRgb(fogConfigs.night.spaceColor);
      const startHorizonBlend =
        (currentFog?.["horizon-blend"] as number) ??
        fogConfigs.night.horizonBlend;
      const startStarIntensity =
        (currentFog?.["star-intensity"] as number) ??
        fogConfigs.night.starIntensity;

      const targetColor = parseRgb(targetConfig.color);
      const targetHighColor = parseRgb(targetConfig.highColor);
      const targetSpaceColor = parseRgb(targetConfig.spaceColor);

      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const rawProgress = Math.min(elapsed / duration, 1);
        const progress = easeInOutCubic(rawProgress);

        const interpolatedFog = {
          color: lerpRgb(startColor, targetColor, progress),
          "high-color": lerpRgb(startHighColor, targetHighColor, progress),
          "horizon-blend": lerp(
            startHorizonBlend,
            targetConfig.horizonBlend,
            progress,
          ),
          "space-color": lerpRgb(startSpaceColor, targetSpaceColor, progress),
          "star-intensity": lerp(
            startStarIntensity,
            targetConfig.starIntensity,
            progress,
          ),
        };

        if (!mapInstance.isStyleLoaded?.()) return;
        mapInstance.setFog(interpolatedFog);

        if (rawProgress < 1) {
          animationFrame = requestAnimationFrame(animate);
        }
      };

      animationFrame = requestAnimationFrame(animate);

      return () => {
        if (animationFrame) {
          cancelAnimationFrame(animationFrame);
        }
      };
    } catch (e) {
      devLog("Light preset configuration not available:", e);
    }
  }, [lightPreset, mapLoaded]);

  // Handle 3D terrain toggle
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    if (show3DTerrain) {
      // Enable 3D terrain with exaggeration
      map.current.setTerrain({
        source: "mapbox-dem",
        exaggeration: 1.5,
      });

      // Animate to a better viewing angle for terrain
      map.current.easeTo({
        pitch: 60,
        duration: 1000,
      });
    } else {
      // Disable terrain
      map.current.setTerrain(null);

      // Return to normal viewing angle
      map.current.easeTo({
        pitch: isMobile ? 30 : 50,
        duration: 1000,
      });
    }
  }, [show3DTerrain, mapLoaded, isMobile]);

  // Density heatmap layer (add / rebuild / tear-down) — extracted hook.
  useDensityLayer({
    mapRef: map,
    mapLoaded,
    isMobile,
    showDensityLayer,
    densityData,
    timelapseMode,
    timelapse: {
      currentData: timelapse.currentData,
      currentHour: timelapse.currentHour,
    },
    isLightBasemap: mapStyle === "light" || mapStyle === "streets",
    intensityScale: heatIntensity,
  });

  // Movement paths + animated flow — extracted hook.
  useMovementPathsLayer({
    mapRef: map,
    mapLoaded,
    showMovementPaths,
    pathData,
    flowAnimationRef,
    platformSettingsRef: platformSettings,
    mapboxglRef,
    minFrequency: minPathFrequency,
  });

  // Skeleton markers removed - direct rendering architecture
  // Venues render immediately when available, no loading placeholders

  // Optimized marker updates with throttling
  const updateMarkers = () => {
    if (!map.current || !mapLoaded) return;

    const mapInstance = map.current;

    // Marker chrome adapts to the *map style*, not the app theme (app is dark-only).
    // Light/streets basemaps get light glass + deeper ink; dark/satellite get dark glass.
    const isDarkTheme = !(mapStyle === "light" || mapStyle === "streets");

    // Category palette + glyphs live in ./map/markerStyles (pure helpers).

    // Use requestAnimationFrame for smoother updates
    const passId = ++markerPassRef.current;
    requestAnimationFrame(() => {
      // Superseded by a newer pass (e.g. rapid city switching) — bail out so we
      // never append a second set of markers on top of the current field.
      if (passId !== markerPassRef.current) return;
      if (!map.current) return;

      // Markers are reconciled against this index: reused when the key matches,
      // created when new, and removed at the end when no longer present.
      const prevIndex = markerIndexRef.current;
      const nextIndex = new Map<string, MapboxGL.Marker>();
      // Get current zoom level for dynamic sizing
      const currentZoom = mapInstance.getZoom();

      // Zoom scaling — larger markers for better visibility (see markerStyles).
      const zoomFactor = markerZoomFactor(currentZoom);

      // Increased base size for better visibility on dark map
      const baseSize = 42 * zoomFactor;

      // Cheap planar distance, used to detect neighbouring venues.
      const getDistance = planarDistance;

      // All venues are visible; the previous Open-Now filter was removed from
      // the Layers panel — users can still see venue hours via the JetCard.
      // At low zoom, dense fields collapse into cluster bubbles so the map
      // stays readable; tapping a bubble zooms into that neighborhood.
      const { clusters, singles } = clusterVenues(venues, currentZoom);
      const visibleVenues = singles;

      clusters.forEach((cluster) => {
        if (!mapboxglRef.current || !mapInstance) return;
        const count = cluster.items.length;
        const clusterKey = `c:${cluster.lat.toFixed(4)}:${cluster.lng.toFixed(4)}:${count}:${isDarkTheme ? "d" : "l"}`;
        const reusedCluster = prevIndex.get(clusterKey);
        if (reusedCluster) {
          nextIndex.set(clusterKey, reusedCluster);
          return;
        }
        const el = createClusterMarkerElement(count, isDarkTheme);

        el.addEventListener("click", (e) => {
          e.stopPropagation();
          triggerHaptic("light");
          mapInstance.easeTo({
            center: [cluster.lng, cluster.lat],
            zoom: Math.min(16, mapInstance.getZoom() + 2.5),
            duration: 600,
          });
        });

        try {
          if (!mapInstance.getContainer()) return;
        } catch {
          return;
        }
        const clusterMarker = new mapboxglRef.current.Marker({ element: el })
          .setLngLat([cluster.lng, cluster.lat])
          .addTo(mapInstance);
        nextIndex.set(clusterKey, clusterMarker);
      });

      // Add venue markers
      visibleVenues.forEach((venue, index) => {
        // Guard against map becoming null during iteration
        if (!mapInstance) return;

        // `isDarkTheme` here tracks the basemap, not the app theme.
        const color = getActivityColor(venue.activity, !isDarkTheme);
        const casing = casingFor(!isDarkTheme);
        const floral = getCategoryFloral(venue.category);
        const floralColor = isDarkTheme ? floral.dark : floral.light;
        const isSelected = !!selectedVenue && selectedVenue.id === venue.id;
        const hasSelection = !!selectedVenue;
        // Tier drives every activity-derived visual (fill, size, pulse) so the
        // marker, the legend and the JetCard always agree on the same venue.
        const tier = activityTier(venue.activity);
        const isHighActivity = tier.id === "peak";
        const GOLD = "#C9A961";

        // Check proximity to other venues
        let nearbyCount = 0;
        visibleVenues.forEach((otherVenue, otherIndex) => {
          if (index !== otherIndex) {
            const distance = getDistance(
              venue.lat,
              venue.lng,
              otherVenue.lat,
              otherVenue.lng,
            );
            if (distance < 0.001) nearbyCount++; // Very close proximity
          }
        });

        // Adjust size based on proximity - slightly smaller for clustered areas
        const proximityFactor =
          nearbyCount > 0 ? Math.max(0.85, 1 - nearbyCount * 0.04) : 1;
        const activitySizeFactor =
          tier.id === "peak" ? 1.15 : tier.id === "busy" ? 1.08 : 1;
        const selectionFactor = isSelected ? 1.25 : 1;
        // Increased minimum size for better visibility
        const markerSize =
          Math.max(32, Math.min(38, baseSize * 0.8)) *
          proximityFactor *
          activitySizeFactor *
          selectionFactor;
        const markerHeight = markerSize * 1.35;
        // Reconciliation key: identical key => identical pin, so reuse the live
        // marker instead of removing and re-adding it (which caused a flicker
        // and, on overlapping passes, duplicate pins).
        const venueKey = [
          "v",
          venue.id,
          venue.lat.toFixed(5),
          venue.lng.toFixed(5),
          Math.round(venue.activity),
          Math.round(markerSize),
          isSelected ? "sel" : hasSelection ? "dim" : "on",
          isDarkTheme ? "d" : "l",
          venueDealCounts[venue.id] || 0,
          String(venueOpenStatus.get(venue.id) ?? "unknown"),
        ].join("|");
        const reusedVenue = prevIndex.get(venueKey);
        if (reusedVenue) {
          nextIndex.set(venueKey, reusedVenue);
          return;
        }
        // Create teardrop marker element with entrance animation
        const staggerDelay = (index % 30) * 30;
        const el = document.createElement("div");
        el.className = "venue-marker";
        // Consumed by the pitch/distance thinning pass so the selected pin is
        // never culled.
        el.dataset.venueId = String(venue.id ?? "");
        el.dataset.selected = isSelected ? "true" : "false";
        // Dim non-selected markers when a venue is selected
        const dimOpacity = hasSelection && !isSelected ? "0.45" : "1";
        el.style.cssText = `
        display: flex;
        flex-direction: column;
        align-items: center;
        cursor: pointer;
        will-change: opacity, transform;
        opacity: 0;
        animation: markerFadeIn 0.4s ease-out ${staggerDelay}ms forwards;
        background: transparent;
        --target-opacity: ${dimOpacity};
        transition: opacity 0.25s ease;
        z-index: ${isSelected ? "200" : isHighActivity ? "50" : "10"};
      `;

        // Determine pulse animation speed based on activity level
        // Disable pulse for reduced motion/low power mode
        const shouldAnimate =
          platformSettings.current.markerAnimation && isTabVisible;
        const pulseSpeed =
          tier.id === "peak"
            ? "1.5s"
            : tier.id === "busy"
              ? "2.5s"
              : tier.id === "steady"
                ? "3.2s"
                : "4s";
        const pulseOpacity =
          tier.id === "peak"
            ? "0.8"
            : tier.id === "busy"
              ? "0.5"
              : tier.id === "steady"
                ? "0.38"
                : "0.3";

        // Create teardrop pin container
        const pinEl = document.createElement("div");
        pinEl.style.cssText = `
        width: ${markerSize}px;
        height: ${markerHeight}px;
        position: relative;
        transition: transform 0.2s ease;
        background: transparent;
        transform: ${isSelected ? "scale(1.05)" : "scale(1)"};
      `;

        // Layered depth: soft outer halo (blurred glow)
        const haloEl = document.createElement("div");
        const haloSize = markerSize + 22;
        const haloColor = isSelected ? GOLD : floralColor;
        haloEl.style.cssText = `
        position: absolute;
        top: ${(markerSize - haloSize) / 2}px;
        left: ${(markerSize - haloSize) / 2}px;
        width: ${haloSize}px;
        height: ${haloSize}px;
        border-radius: 50%;
        background: radial-gradient(circle, ${haloColor}55 0%, ${haloColor}22 45%, transparent 70%);
        filter: blur(6px);
        pointer-events: none;
        opacity: ${isSelected ? "0.95" : isHighActivity ? "0.7" : "0.45"};
      `;

        // Create animated gradient ring (behind teardrop) - with activity-based color
        // Only animate if not in low power/reduced motion mode
        const ringEl = document.createElement("div");
        const ringSize = markerSize + 10;
        const ringColor = isSelected || isHighActivity ? GOLD : color;
        const ringWidth = isSelected ? 2.5 : 2;
        ringEl.style.cssText = `
        position: absolute;
        top: ${(markerSize - ringSize) / 2}px;
        left: ${(markerSize - ringSize) / 2}px;
        width: ${ringSize}px;
        height: ${ringSize}px;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        transform-origin: center center;
        background: transparent;
        border: ${ringWidth}px solid ${ringColor};
        opacity: ${isSelected ? "1" : pulseOpacity};
        box-shadow: ${isSelected || isHighActivity ? `0 0 12px ${GOLD}80` : "none"};
        ${shouldAnimate ? `animation: markerRingPulse ${pulseSpeed} ease-in-out infinite;` : ""}
      `;

        // Create teardrop shape - glassmorphic design with frosted glass effect
        const teardropEl = document.createElement("div");
        teardropEl.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: ${markerSize}px;
        height: ${markerSize}px;
        /* Near-opaque core: letting the basemap show through the fill is what
           made markers wash out over satellite and busy street tiles. */
        background: ${
          isDarkTheme ? "rgba(30, 30, 35, 0.94)" : "rgba(255, 255, 255, 0.95)"
        };
        backdrop-filter: blur(12px) saturate(180%);
        -webkit-backdrop-filter: blur(12px) saturate(180%);
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        transform-origin: center center;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1.5px solid ${
          isSelected
            ? GOLD
            : isDarkTheme
              ? `rgba(255, 255, 255, 0.15)`
              : `rgba(0, 0, 0, 0.08)`
        };
        box-shadow: 
          0 4px 16px rgba(0, 0, 0, ${isDarkTheme ? "0.4" : "0.15"}),
          inset 0 1px 0 rgba(255, 255, 255, ${isDarkTheme ? "0.1" : "0.5"}),
          0 0 0 1px ${isSelected ? GOLD : color}${isSelected ? "99" : "40"},
          /* Contrast casing: drawn outside the fill so the marker stays
             readable over arbitrary basemap pixels (satellite especially). */
          0 0 0 3px ${casing};
      `;

        // Category-aware iconography (counter-rotated to stay upright)
        const iconWrap = document.createElement("div");
        const iconSize = Math.round(markerSize * 0.5);
        iconWrap.style.cssText = `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) rotate(45deg);
        width: ${iconSize}px;
        height: ${iconSize}px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: ${floralColor};
        filter: drop-shadow(0 1px 2px rgba(0,0,0,${isDarkTheme ? "0.45" : "0.2"}));
      `;
        iconWrap.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${iconSize}" height="${iconSize}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">${getCategoryIcon(venue.category)}</svg>`;
        teardropEl.appendChild(iconWrap);

        pinEl.appendChild(haloEl);
        pinEl.appendChild(ringEl);

        // Selected pin gets an extra expanding gold halo so it reads as the
        // active venue at a glance (e.g. when opened from Favorites).
        if (isSelected && shouldAnimate) {
          const focusEl = document.createElement("div");
          const focusSize = markerSize + 30;
          focusEl.style.cssText = `
        position: absolute;
        top: ${(markerSize - focusSize) / 2}px;
        left: ${(markerSize - focusSize) / 2}px;
        width: ${focusSize}px;
        height: ${focusSize}px;
        border-radius: 50%;
        border: 2px solid ${GOLD};
        box-shadow: 0 0 18px ${GOLD}66;
        pointer-events: none;
        will-change: transform, opacity;
        animation: markerFocusHalo 2s ease-out infinite;
      `;
          pinEl.appendChild(focusEl);
        }
        pinEl.appendChild(teardropEl);
        el.appendChild(pinEl);

        // Glassmorphic label chip (slides up on hover/selection)
        const dealCount = venueDealCounts[venue.id] || 0;
        const chipEl = document.createElement("div");
        chipEl.className = "venue-marker-chip";
        chipEl.style.cssText = `
        position: absolute;
        bottom: ${markerHeight + 8}px;
        left: 50%;
        transform: translateX(-50%) translateY(6px);
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 10px;
        border-radius: 999px;
        background: ${isDarkTheme ? "rgba(20, 20, 24, 0.78)" : "rgba(255, 255, 255, 0.85)"};
        backdrop-filter: blur(14px) saturate(180%);
        -webkit-backdrop-filter: blur(14px) saturate(180%);
        border: 1px solid ${isDarkTheme ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.08)"};
        box-shadow: 0 6px 20px rgba(0,0,0,${isDarkTheme ? "0.5" : "0.18"}), 0 0 0 1px ${isSelected ? GOLD : color}40;
        color: ${isDarkTheme ? "#fff" : "#0a0a0a"};
        font-size: 11.5px;
        font-weight: 600;
        letter-spacing: 0.01em;
        white-space: nowrap;
        max-width: 180px;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.18s ease, transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1);
        z-index: 2;
      `;
        const nameSpan = document.createElement("span");
        nameSpan.textContent = venue.name;
        nameSpan.style.cssText =
          "overflow:hidden;text-overflow:ellipsis;max-width:130px;";
        chipEl.appendChild(nameSpan);
        // Open / Closed status pill — mirrors JetCard logic so the marker chip
        // reflects the same business-hours signal as the detail card.
        const venueIsOpen: boolean | null =
          venueOpenStatus.get(venue.id) ?? null;
        if (venueIsOpen !== null) {
          const statusPill = document.createElement("span");
          statusPill.textContent = venueIsOpen ? "Open" : "Closed";
          statusPill.setAttribute(
            "aria-label",
            venueIsOpen
              ? `${venue.name} is open now`
              : `${venue.name} is closed`,
          );
          const openBg = isDarkTheme
            ? "rgba(34, 197, 94, 0.18)"
            : "rgba(34, 197, 94, 0.16)";
          const closedBg = isDarkTheme
            ? "rgba(239, 68, 68, 0.18)"
            : "rgba(239, 68, 68, 0.14)";
          statusPill.style.cssText = `
          display:inline-flex;align-items:center;gap:4px;
          padding: 2px 7px;
          border-radius: 999px;
          background: ${venueIsOpen ? openBg : closedBg};
          color: ${venueIsOpen ? "hsl(var(--cool))" : "hsl(var(--hot))"};
          border: 1px solid currentColor;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        `;
          const dot = document.createElement("span");
          dot.style.cssText = `
          width:6px;height:6px;border-radius:999px;
          background: currentColor;
          box-shadow: 0 0 6px currentColor;
        `;
          statusPill.prepend(dot);
          chipEl.appendChild(statusPill);
        }
        if (dealCount > 0) {
          const dealPill = document.createElement("span");
          dealPill.textContent = `${dealCount} deal${dealCount > 1 ? "s" : ""}`;
          dealPill.style.cssText = `
          display:inline-flex;align-items:center;
          padding: 2px 7px;
          border-radius: 999px;
          background: linear-gradient(135deg, ${GOLD}, #b8924a);
          color: #0a0a0a;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.02em;
        `;
          chipEl.appendChild(dealPill);
        }
        // Little caret/arrow under the chip
        const caretEl = document.createElement("div");
        caretEl.style.cssText = `
        position: absolute;
        bottom: -4px;
        left: 50%;
        transform: translateX(-50%) rotate(45deg);
        width: 8px;
        height: 8px;
        background: inherit;
        border-right: 1px solid ${isDarkTheme ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.08)"};
        border-bottom: 1px solid ${isDarkTheme ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.08)"};
      `;
        chipEl.appendChild(caretEl);
        el.appendChild(chipEl);

        // Debounce hide so a brief pointerleave→pointerenter (or quick tap)
        // doesn't cause the chip to flicker closed.
        let hideTimer: number | null = null;
        const clearHideTimer = () => {
          if (hideTimer !== null) {
            window.clearTimeout(hideTimer);
            hideTimer = null;
          }
        };
        const hideChipNow = () => {
          clearHideTimer();
          chipEl.style.opacity = "0";
          chipEl.style.transform = "translateX(-50%) translateY(6px)";
          if (activeChipRef.current?.el === chipEl) {
            activeChipRef.current = null;
          }
        };
        const hideChip = () => {
          clearHideTimer();
          hideTimer = window.setTimeout(hideChipNow, 120);
        };
        const hideChipUnlessSelected = () => {
          if (isSelected) return;
          hideChip();
        };
        const showChip = () => {
          clearHideTimer();
          // Close any previously-open chip on a different marker
          const prev = activeChipRef.current;
          if (prev && prev.el !== chipEl) prev.hide();
          chipEl.style.opacity = "1";
          chipEl.style.transform = "translateX(-50%) translateY(0)";
          activeChipRef.current = {
            el: chipEl,
            venueId: venue.id,
            hide: hideChipNow,
          };
        };
        if (isSelected) showChip();

        // Hover effects - scale and enhanced glassmorphic shadow.
        // Use pointer events + gate on pointerType so touch devices don't fire
        // synthetic mouseenter/mouseleave that would compete with touchstart.
        el.addEventListener("pointerenter", (e) => {
          if ((e as PointerEvent).pointerType !== "mouse") return;
          el.style.zIndex = "300";
          pinEl.style.transform = isSelected ? "scale(1.2)" : "scale(1.15)";
          teardropEl.style.boxShadow = `
          0 8px 24px rgba(0, 0, 0, ${isDarkTheme ? "0.5" : "0.2"}),
          inset 0 1px 0 rgba(255, 255, 255, ${isDarkTheme ? "0.15" : "0.6"}),
          0 0 0 2px ${isSelected ? GOLD : color}90
        `;
          ringEl.style.opacity = "1";
          haloEl.style.opacity = "1";
          showChip();
        });

        el.addEventListener("pointerleave", (e) => {
          if ((e as PointerEvent).pointerType !== "mouse") return;
          el.style.zIndex = isSelected ? "200" : isHighActivity ? "50" : "10";
          pinEl.style.transform = isSelected ? "scale(1.05)" : "scale(1)";
          teardropEl.style.boxShadow = `
          0 4px 16px rgba(0, 0, 0, ${isDarkTheme ? "0.4" : "0.15"}),
          inset 0 1px 0 rgba(255, 255, 255, ${isDarkTheme ? "0.1" : "0.5"}),
          0 0 0 1px ${isSelected ? GOLD : color}${isSelected ? "99" : "40"}
        `;
          ringEl.style.opacity = isSelected ? "1" : pulseOpacity;
          haloEl.style.opacity = isSelected
            ? "0.95"
            : isHighActivity
              ? "0.7"
              : "0.45";
          hideChipUnlessSelected();
        });
        // Touch: open immediately on tap. The subsequent click promotes the
        // marker to selected, so the chip stays open via React re-render.
        // No auto-hide timer — avoids flicker on quick taps. Off-map taps and
        // selecting a different marker close it cleanly.
        el.addEventListener(
          "touchstart",
          () => {
            showChip();
          },
          { passive: true },
        );

        // Create marker with bottom anchor for teardrop (pin point at GPS location)
        // Bail if the map was removed mid-render — addTo() would throw on a
        // torn-down container.
        if (
          !mapboxglRef.current ||
          !mapInstance ||
          typeof mapInstance.getContainer !== "function"
        )
          return;
        try {
          if (!mapInstance.getContainer()) return;
        } catch {
          return;
        }
        const marker = new mapboxglRef.current.Marker({
          element: el,
          anchor: "bottom",
        })
          .setLngLat([venue.lng, venue.lat])
          .addTo(mapInstance);

        // Handle click on the marker element — only trigger JetCard, no Mapbox popup
        el.addEventListener("click", (e) => {
          e.stopPropagation();

          // A click promotes this marker to selected — cancel any pending hide
          // so the chip stays open through the re-render.
          clearHideTimer();

          // Haptic feedback for venue selection
          triggerHaptic("medium");

          // Open venue card (use ref to avoid stale closure)
          onVenueSelectRef.current(venue);
        });

        nextIndex.set(venueKey, marker);
      });

      // Retire only the markers that are genuinely gone (old city, re-cluster,
      // changed appearance). Everything reused stays mounted the whole time.
      prevIndex.forEach((marker, key) => {
        if (!nextIndex.has(key)) marker.remove();
      });
      markerIndexRef.current = nextIndex;
      markersRef.current = Array.from(nextIndex.values());
    }); // Close requestAnimationFrame
  };

  // Thin out distant venue markers based on camera pitch/distance-from-center.
  useMarkerDeclutter({
    mapRef: map,
    mapLoaded,
    markersRef: markersRef as any,
    markerRevision: `${venues.length}:${selectedVenue?.id ?? ""}:${selectedCity.name}`,
  });

  // Call updateMarkers on initial load and when venues change
  useEffect(() => {
    updateMarkers();
  }, [
    clusterStep,
    venues,
    mapLoaded,
    isLoadingVenues,
    selectedCity,
    selectedVenue,
    venueDealCounts,
    venueOpenStatus,
    mapStyle,
  ]);

  // Fetch active-deal counts for currently displayed venues
  useEffect(() => {
    if (!venues.length) {
      setVenueDealCounts({});
      return;
    }
    let cancelled = false;
    const ids = Array.from(new Set(venues.map((v) => v.id))).filter(Boolean);
    (async () => {
      const { data, error } = await supabase
        .from("deals")
        .select("venue_id")
        .eq("active", true)
        .in("venue_id", ids);
      if (cancelled || error || !data) return;
      const counts: Record<string, number> = {};
      for (const row of data as Array<{ venue_id: string | null }>) {
        if (row.venue_id)
          counts[row.venue_id] = (counts[row.venue_id] || 0) + 1;
      }
      setVenueDealCounts(counts);
    })();
    return () => {
      cancelled = true;
    };
  }, [venues]);

  // Add heatmap blend layer for clustering visualization at low zoom levels
  useEffect(() => {
    if (!map.current || !mapLoaded || venues.length === 0) return;

    const mapInstance = map.current;
    const sourceId = "venue-heatmap-source";
    const heatmapLayerId = "venue-heatmap-layer";

    // Wait for style to be loaded before modifying sources/layers
    if (!mapInstance.isStyleLoaded()) {
      return;
    }

    // Remove existing layers and source if they exist
    try {
      if (mapInstance.getLayer(heatmapLayerId)) {
        mapInstance.removeLayer(heatmapLayerId);
      }
      if (mapInstance.getSource(sourceId)) {
        mapInstance.removeSource(sourceId);
      }
    } catch (e) {
      console.warn("[Heatmap] Error cleaning up existing source/layer:", e);
    }

    // Create GeoJSON data from venues with activity as weight
    const geojsonData: FeatureCollection<Geometry> = {
      type: "FeatureCollection",
      features: venues.map((venue) => ({
        type: "Feature",
        properties: {
          activity: venue.activity,
          name: venue.name,
        },
        geometry: {
          type: "Point",
          coordinates: [venue.lng, venue.lat],
        },
      })),
    };

    // Add source - check again that it doesn't exist
    try {
      if (!mapInstance.getSource(sourceId)) {
        mapInstance.addSource(sourceId, {
          type: "geojson",
          data: geojsonData,
        });
      } else {
        // Update existing source data
        const source = mapInstance.getSource(
          sourceId,
        ) as mapboxgl.GeoJSONSource;
        source.setData(geojsonData);
      }
    } catch (e) {
      console.warn("[Heatmap] Error adding source:", e);
      return;
    }

    // Add heatmap layer that fades out at higher zoom levels
    try {
      if (!mapInstance.getLayer(heatmapLayerId)) {
        mapInstance.addLayer(
          {
            id: heatmapLayerId,
            type: "heatmap",
            source: sourceId,
            maxzoom: 15,
            paint: {
              // Weight based on activity level
              "heatmap-weight": [
                "interpolate",
                ["linear"],
                ["get", "activity"],
                0,
                0.1,
                50,
                0.5,
                80,
                0.8,
                100,
                1,
              ],
              // Intensity increases with zoom
              "heatmap-intensity": [
                "interpolate",
                ["linear"],
                ["zoom"],
                8,
                isMobile ? 0.75 : 0.6,
                12,
                isMobile ? 0.9 : 1,
                15,
                isMobile ? 1.25 : 1.5,
              ],
              // Color gradient - matches app theme (orange/red primary)
              "heatmap-color": [
                "interpolate",
                ["linear"],
                ["heatmap-density"],
                0,
                "rgba(0, 0, 0, 0)",
                0.1,
                "rgba(255, 140, 0, 0.15)",
                0.3,
                "rgba(255, 100, 50, 0.3)",
                0.5,
                "rgba(255, 69, 58, 0.45)",
                0.7,
                "rgba(255, 45, 85, 0.6)",
                0.9,
                "rgba(200, 50, 120, 0.75)",
                1,
                "rgba(150, 50, 150, 0.9)",
              ],
              // Radius increases at lower zoom, decreases when zoomed in
              "heatmap-radius": [
                "interpolate",
                ["cubic-bezier", 0.4, 0, 0.2, 1],
                ["zoom"],
                8,
                isMobile ? 40 : 30,
                10,
                isMobile ? 34 : 25,
                12,
                isMobile ? 28 : 20,
                13,
                isMobile ? 22 : 16,
                15,
                isMobile ? 14 : 10,
              ],
              // Fade out opacity as zoom increases (individual markers take over)
              "heatmap-opacity": [
                "interpolate",
                ["cubic-bezier", 0.4, 0, 0.2, 1],
                ["zoom"],
                10,
                isMobile ? 0.7 : 0.8,
                11.5,
                isMobile ? 0.58 : 0.65,
                13,
                isMobile ? 0.32 : 0.4,
                14,
                isMobile ? 0.15 : 0.2,
                15,
                0,
              ],
              // Smooth tween between paint updates (city switch, viewport flip)
              "heatmap-radius-transition": { duration: 400, delay: 0 },
              "heatmap-opacity-transition": { duration: 500, delay: 0 },
            },
          },
          "waterway-label",
        ); // Insert below labels
      }
    } catch (e) {
      console.warn("[Heatmap] Error adding layer:", e);
    }

    return () => {
      // Check style is loaded before cleanup to prevent "getOwnLayer" errors
      if (mapInstance.style?.loaded()) {
        if (mapInstance.getLayer(heatmapLayerId)) {
          mapInstance.removeLayer(heatmapLayerId);
        }
        if (mapInstance.getSource(sourceId)) {
          mapInstance.removeSource(sourceId);
        }
      }
    };
  }, [venues, mapLoaded, isMobile]);

  // Add smooth zoom and pan transitions
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    const mapInstance = map.current;

    // Smooth resize during zoom with staggered animation
    const handleZoom = () => {
      const currentZoom = mapInstance.getZoom();

      let zoomFactor: number;
      if (currentZoom < 8) {
        zoomFactor = Math.max(0.3, currentZoom / 20);
      } else if (currentZoom < 12) {
        zoomFactor = 0.4 + ((currentZoom - 8) / 4) * 0.4;
      } else {
        zoomFactor = 0.8 + Math.min(0.5, (currentZoom - 12) / 8);
      }

      const newBaseSize = 36 * zoomFactor;

      markersRef.current.forEach((marker, index) => {
        const el = marker.getElement();
        if (el) {
          // Add staggered delay for smoother animation
          const delay = (index % 20) * 10; // Stagger in groups
          setTimeout(() => {
            const orbEl = el.querySelector("div") as HTMLElement;
            if (orbEl) {
              // Update orb size
              orbEl.style.width = `${newBaseSize}px`;
              orbEl.style.height = `${newBaseSize}px`;

              // Update core size
              const coreEl = orbEl.querySelector(
                'div:not([style*="position: absolute"])',
              ) as HTMLElement;
              if (coreEl && !coreEl.style.position?.includes("absolute")) {
                const coreSize = newBaseSize * 0.55;
                coreEl.style.width = `${coreSize}px`;
                coreEl.style.height = `${coreSize}px`;

                const svg = coreEl.querySelector("svg");
                if (svg) {
                  svg.setAttribute("width", `${coreSize * 0.55}`);
                  svg.setAttribute("height", `${coreSize * 0.55}`);
                }
              }
            }
          }, delay);
        }
      });
    };

    // Removed fade effect during panning - markers now stay fully visible and anchored

    // Re-run the marker pass when the camera crosses a clustering step so
    // bubbles split/merge instead of freezing at the zoom they were built at.
    const handleZoomEnd = () => {
      const z = mapInstance.getZoom();
      setClusterStep(z >= CLUSTER_MAX_ZOOM ? -1 : Math.round(z * 2) / 2);
    };

    mapInstance.on("zoom", handleZoom);
    mapInstance.on("zoomend", handleZoomEnd);
    // moveend also fires at the end of a city fly-to, where the zoom may not
    // change but the marker field must be rebuilt for the new viewport.
    mapInstance.on("moveend", handleZoomEnd);
    handleZoomEnd();

    return () => {
      mapInstance.off("zoom", handleZoom);
      mapInstance.off("zoomend", handleZoomEnd);
      mapInstance.off("moveend", handleZoomEnd);
    };
  }, [mapLoaded, venues]);

  // Update map view when selected city changes
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    const mapInstance = map.current;

    mapInstance.flyTo({
      center: [selectedCity.lng, selectedCity.lat],
      zoom: selectedCity.zoom,
      pitch: isMobile ? 30 : 50,
      duration: 2000,
      essential: true,
    });

    // Rebuild markers when the camera actually settles on the new city, so
    // clustering is computed at the final zoom instead of a mid-flight one.
    // A timeout fallback covers interrupted/instant camera moves.
    let done = false;
    const rebuild = () => {
      if (done) return;
      done = true;
      updateMarkers();
    };
    mapInstance.once("moveend", rebuild);
    const fallback = window.setTimeout(rebuild, 2400);

    return () => {
      done = true;
      window.clearTimeout(fallback);
      mapInstance.off("moveend", rebuild);
    };
  }, [selectedCity, mapLoaded, isMobile]);

  // Deal markers removed - no longer displaying colored circles on map

  return (
    <div
      className="relative"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        minHeight: "100%",
        // DO NOT use contain: layout — it creates a containing block for fixed children,
        // breaking fixed positioning of overlay controls.
        // DO NOT use transform or will-change: transform — breaks backdrop-filter rendering.
        contain: "style",
        isolation: "isolate",
      }}
    >
      {/* Single crossfade source of truth: HeatmapSkeleton -> interactive map.
          Opacity is driven solely by `mapLoaded`. When the fade-out finishes
          we unmount via onTransitionEnd so the skeleton stops painting. No
          intermediate opacity gates anywhere in the render path. */}
      {skeletonMounted && !mapError && (
        <div
          aria-hidden={mapLoaded}
          onTransitionEnd={(e) => {
            if (e.propertyName === "opacity" && mapLoaded) {
              setSkeletonMounted(false);
            }
          }}
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 40,
            transition: "opacity 400ms ease-out",
            opacity: mapLoaded ? 0 : 1,
            pointerEvents: mapLoaded ? "none" : "auto",
            willChange: "opacity",
          }}
        >
          {/* Opaque while the GL module loads, then translucent so tiles
              bleed through during the single crossfade. */}
          <HeatmapSkeleton translucent={loadingStage !== "module"} />
        </div>
      )}

      {/* Map Error State with Retry - deferred to not become LCP element */}
      {mapError && !mapInitializing && (
        <div
          className="bg-background/95 backdrop-blur-sm"
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            contentVisibility: "auto",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "16px",
              padding: "24px",
              maxWidth: "24rem",
              textAlign: "center",
            }}
          >
            <div
              className="rounded-full bg-destructive/10"
              style={{
                width: "56px",
                height: "56px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <AlertCircle
                className="w-7 h-7 text-destructive"
                aria-hidden="true"
              />
            </div>
            <div className="space-y-2">
              {/* h3 is larger - should be LCP if error shows, not the p tag */}
              <h3 className="text-lg font-semibold text-foreground">
                Map Loading Failed
              </h3>
              {/* Small text won't be LCP candidate due to smaller size */}
              <p className="text-xs text-muted-foreground leading-relaxed">
                {mapError}
              </p>
              {retryCount > 0 && (
                <p className="text-xs text-muted-foreground/70">
                  Attempt {retryCount + 1} failed. Try refreshing the page.
                </p>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-2 w-full">
              <Button
                onClick={() => {
                  setMapError(null);
                  setMapInitializing(true);
                  setSkeletonMounted(true);
                  setLoadingStage("module");
                  // Reset the module promise to force a fresh load attempt
                  mapboxLoadPromise = null;
                  setRetryCount((c) => c + 1);
                }}
                className="gap-2 flex-1"
                variant={retryCount > 1 ? "outline" : "default"}
              >
                <Route className="w-4 h-4" />
                Try Again
              </Button>
              {retryCount > 1 && (
                <Button
                  onClick={() => window.location.reload()}
                  className="gap-2 flex-1"
                >
                  Refresh Page
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
      <div
        ref={mapContainer}
        className="absolute inset-0 overflow-hidden map-container"
        style={{
          width: "100%",
          height: "100%",
          minWidth: "100%",
          minHeight: "100%",
          touchAction: isMobile ? "manipulation" : "none",
          WebkitOverflowScrolling: "touch",
          // DO NOT use transform or will-change here — breaks backdrop-filter on sibling overlays
          // and creates a containing block that traps fixed-position children
        }}
      />

      {/* Unified Top-Left Controls: Location + Map Style in one compact row */}
      {controlsReady && (
        <div
          style={{
            position: "absolute",
            display: "flex",
            alignItems: "center",
            top: "var(--map-ui-inset-top, 0.75rem)",
            left: "var(--map-ui-inset-left, 0.75rem)",
            gap: "clamp(4px, 0.8vw, 8px)",
            zIndex: 30,
          }}
        >
          <Select
            value={
              isUsingCurrentLocation ? "current-location" : selectedCity.id
            }
            onOpenChange={(open) => {
              if (!open) setCitySearchQuery("");
              // Notify floating panels (e.g. SearchResults) to recalc position
              if (typeof window !== "undefined") {
                window.dispatchEvent(
                  new CustomEvent("jet:floating-ui-toggle", {
                    detail: { source: "city-select", open },
                  }),
                );
              }
            }}
            onValueChange={(value) => {
              // Haptic feedback for city selection
              triggerHaptic("light");

              if (value === "current-location") {
                // Always resolve a fresh fix — the previously detected city can
                // be stale, so the city sync happens from the new position only.
                refreshCurrentLocation();
                // Optimistically fly to the last known location while the fresh
                // fix resolves.
                if (userLocation && map.current) {
                  map.current.flyTo({
                    center: [userLocation.lng, userLocation.lat],
                    zoom: Math.max(map.current.getZoom(), 13),
                    duration: 1500,
                    essential: true,
                  });
                }
              } else {
                const city =
                  CITIES.find((c) => c.id === value) ??
                  remoteCities.find((c) => c.id === value);
                if (city) {
                  selectCityAndFly(city);
                  setRemoteCities([]);
                }

              }
            }}
          >
            <SelectTrigger
              className="text-[11px] sm:text-xs shadow-xl"
              aria-label="Select city location"
              aria-haspopup="listbox"
              style={{
                height: "clamp(36px, 5.5vw, 44px)",
                paddingLeft: "clamp(12px, 1.75vw, 16px)",
                paddingRight: "clamp(12px, 1.75vw, 16px)",
                // Fixed width prevents trigger from resizing when selecting cities of different name lengths
                width: "clamp(176px, 22vw, 240px)",
                minWidth: "clamp(176px, 22vw, 240px)",
                maxWidth: "var(--map-control-max-width, 240px)",
                contain: "layout style",
                background: "hsl(var(--card) / 0.78)",
                backdropFilter: "blur(24px) saturate(1.6)",
                WebkitBackdropFilter: "blur(24px) saturate(1.6)",
                borderRadius: "9999px",
                border: "1.5px solid transparent",
                backgroundClip: "padding-box",
                boxShadow:
                  "0 0 0 1.5px hsl(var(--primary) / 0.28), 0 10px 28px -6px rgba(0,0,0,0.22)",
              }}
            >
              <div className="flex items-center gap-2.5 w-full">
                <MapPin
                  className="w-4 h-4 text-primary flex-shrink-0 self-center"
                  aria-hidden="true"
                />
                <span
                  className="font-display font-bold truncate flex-1 text-left text-foreground text-[12px] sm:text-[13px] leading-tight self-center"
                  style={{ letterSpacing: "-0.015em" }}
                >
                  {isUsingCurrentLocation
                    ? detectedLocationName ||
                      (detectedCity
                        ? `${detectedCity.name}, ${detectedCity.state}`
                        : "Locating...")
                    : `${selectedCity.name}, ${selectedCity.state}`}
                </span>
                {isUsingCurrentLocation &&
                  (detectedLocationName || detectedCity) && (
                    <span
                      className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse flex-shrink-0 self-center"
                      aria-hidden="true"
                    />
                  )}
              </div>
            </SelectTrigger>
            <SelectContent className="min-w-[240px] py-2">
              {/* Search input — stops keystrokes from Select's typeahead */}
              <div
                className="px-2 pb-2 sticky top-0 z-10 bg-popover"
                onKeyDown={(e) => {
                  // Let arrow keys, Enter, and Escape reach Radix Select for keyboard navigation;
                  // stop letter/number/Backspace so they only edit the search field (no typeahead jump).
                  const navKeys = [
                    "ArrowDown",
                    "ArrowUp",
                    "ArrowLeft",
                    "ArrowRight",
                    "Home",
                    "End",
                    "Enter",
                    "Escape",
                    "Tab",
                    "PageUp",
                    "PageDown",
                  ];
                  if (!navKeys.includes(e.key)) {
                    e.stopPropagation();
                  }
                }}
                onPointerDown={(e) => e.stopPropagation()}
                onPointerMove={(e) => e.stopPropagation()}
              >
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                  <Input
                    type="text"
                    inputMode="search"
                    autoComplete="off"
                    spellCheck={false}
                    value={citySearchQuery}
                    onChange={(e) => setCitySearchQuery(e.target.value)}
                    placeholder="Search cities..."
                    className="h-9 pl-8 pr-8 text-sm rounded-lg bg-card/60 border-border/50 focus-visible:ring-1 focus-visible:ring-primary/40 focus-visible:border-primary/50"
                    aria-label="Search cities"
                  />
                  {citySearchQuery && (
                    <button
                      type="button"
                      onClick={() => setCitySearchQuery("")}
                      aria-label="Clear search"
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
              {!citySearchQuery && (
                <SelectItem
                  value="current-location"
                  className="py-3 px-2.5 my-0.5 rounded-lg focus:bg-primary/10"
                  onPointerUp={() => {
                    // Radix skips onValueChange when the current value is picked
                    // again — re-tapping must still re-detect the user's location.
                    if (isUsingCurrentLocation) refreshCurrentLocation();
                  }}
                >
                  <div className="flex items-center gap-3 w-full min-w-0">
                    <span
                      className="w-2 h-2 bg-primary rounded-full animate-pulse flex-shrink-0"
                      aria-hidden="true"
                    />
                    <div className="flex flex-col min-w-0 flex-1">
                      <span
                        className="font-display font-bold text-sm text-foreground truncate"
                        style={{ letterSpacing: "-0.01em", lineHeight: 1.2 }}
                      >
                        {detectedLocationName
                          ? detectedLocationName
                          : detectedCity
                            ? `${detectedCity.name}, ${detectedCity.state}`
                            : "Use my location"}
                      </span>
                      <span
                        className="text-[10px] text-muted-foreground truncate"
                        style={{ lineHeight: 1.2 }}
                      >
                        {userLocation
                          ? "Current Location"
                          : "Tap to detect your spot"}
                      </span>
                    </div>
                    <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-primary/90 flex-shrink-0 px-1.5 py-0.5 rounded-full border border-primary/30 bg-primary/10">
                      Live
                    </span>
                  </div>
                </SelectItem>
              )}
              {!citySearchQuery && (
                <div className="h-px bg-border/60 my-1.5 mx-2" />
              )}
              {(() => {
                const baseList = userLocation
                  ? getCitiesSortedByDistance(
                      userLocation.lat,
                      userLocation.lng,
                    )
                  : CITIES.map((c) => ({ ...c, distanceKm: 0 }));
                const q = citySearchQuery.trim().toLowerCase();
                const filtered = q
                  ? baseList.filter(
                      (c) =>
                        c.name.toLowerCase().includes(q) ||
                        c.state.toLowerCase().includes(q) ||
                        `${c.name}, ${c.state}`.toLowerCase().includes(q),
                    )
                  : baseList;
                if (filtered.length === 0) {
                  return (
                    <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                      No cities match “{citySearchQuery}”
                    </div>
                  );
                }
                return filtered.map((city) => {
                  const distanceMiles = userLocation
                    ? kmToMiles(city.distanceKm)
                    : null;
                  return (
                    <SelectItem
                      key={city.id}
                      value={city.id}
                      className="py-2.5 px-2.5 my-0.5 rounded-lg focus:bg-primary/10"
                    >
                      <div
                        className="flex items-center w-full min-w-0"
                        style={{ gap: "clamp(6px, 1.5vw, 12px)" }}
                      >
                        {/* City name — flexes and truncates so it never wraps */}
                        <span
                          className="font-display font-bold text-[13px] sm:text-sm text-foreground truncate min-w-0 flex-1"
                          style={{ letterSpacing: "-0.005em", lineHeight: 1.3 }}
                        >
                          {city.name}
                        </span>

                        {/* State code — fixed-width chip, never shrinks */}
                        <span
                          className="text-[10px] sm:text-[11px] font-semibold uppercase text-muted-foreground tabular-nums flex-shrink-0"
                          style={{
                            letterSpacing: "0.1em",
                            minWidth: "1.75rem",
                            textAlign: "center",
                            paddingLeft: "clamp(2px, 0.5vw, 6px)",
                            paddingRight: "clamp(2px, 0.5vw, 6px)",
                          }}
                        >
                          {city.state}
                        </span>

                        {/* Distance — right-aligned, fixed width, never wraps */}
                        {distanceMiles !== null && (
                          <span
                            className="text-[10px] sm:text-[11px] font-medium text-muted-foreground/80 tabular-nums flex-shrink-0 text-right whitespace-nowrap"
                            style={{
                              letterSpacing: "0.02em",
                              minWidth: "5.5rem",
                              marginLeft: "clamp(2px, 0.5vw, 6px)",
                            }}
                          >
                            {distanceMiles < 1
                              ? "Nearby"
                              : `${Math.round(distanceMiles)} mi away`}
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  );
                });
              })()}
            </SelectContent>
          </Select>

          {/* Map Style - compact icon button */}
          <Collapsible defaultOpen={false}>
            <CollapsibleTrigger asChild>
              <button
                aria-label="Map style options"
                style={{
                  width: "clamp(32px, 5vw, 40px)",
                  height: "clamp(32px, 5vw, 40px)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "12px",
                  background: "hsl(var(--card) / 0.7)",
                  border: "1px solid hsl(var(--border) / 0.4)",
                  boxShadow:
                    "0 20px 25px -5px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.05)",
                  backdropFilter: "blur(24px)",
                  WebkitBackdropFilter: "blur(24px)",
                  cursor: "pointer",
                  color: "hsl(var(--foreground))",
                }}
              >
                <Palette
                  style={{ width: "16px", height: "16px" }}
                  aria-hidden="true"
                />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                marginTop: "6px",
                zIndex: 20,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  background: "hsl(var(--card) / 0.8)",
                  backdropFilter: "blur(24px)",
                  WebkitBackdropFilter: "blur(24px)",
                  borderRadius: "12px",
                  border: "1px solid hsl(var(--border) / 0.4)",
                  padding: "8px",
                  boxShadow: "0 10px 25px -5px rgba(0,0,0,0.15)",
                  minWidth: "200px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                  }}
                  role="group"
                  aria-label="Map base style"
                >
                  <span
                    style={{
                      fontSize: "9px",
                      color: "hsl(var(--muted-foreground))",
                      fontWeight: 500,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    Style
                  </span>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(4, 1fr)",
                      gap: "4px",
                    }}
                    role="radiogroup"
                  >
                    {(["light", "dark", "streets", "satellite"] as const).map(
                      (style) => (
                        <button
                          key={style}
                          onClick={() => {
                            triggerHaptic("light");
                            manualStyleOverride.current = true;
                            setMapStyle(style);
                          }}
                          aria-pressed={mapStyle === style}
                          style={{
                            height: "28px",
                            fontSize: "9px",
                            padding: "0 6px",
                            textTransform: "capitalize",
                            borderRadius: "8px",
                            border:
                              mapStyle === style
                                ? "1px solid hsl(var(--primary))"
                                : "1px solid hsl(var(--border))",
                            background:
                              mapStyle === style
                                ? "hsl(var(--primary))"
                                : "transparent",
                            color:
                              mapStyle === style
                                ? "hsl(var(--primary-foreground))"
                                : "hsl(var(--foreground))",
                            cursor: "pointer",
                            fontWeight: 600,
                            transition: "all 0.2s",
                          }}
                        >
                          {style}
                        </button>
                      ),
                    )}
                  </div>
                </div>
                <button
                  onClick={() => {
                    triggerHaptic("medium");
                    setShow3DTerrain(!show3DTerrain);
                  }}
                  aria-pressed={show3DTerrain}
                  style={{
                    width: "100%",
                    height: "28px",
                    fontSize: "10px",
                    fontWeight: 600,
                    borderRadius: "8px",
                    border: show3DTerrain
                      ? "1px solid hsl(var(--primary))"
                      : "1px solid hsl(var(--border))",
                    background: show3DTerrain
                      ? "hsl(var(--primary))"
                      : "transparent",
                    color: show3DTerrain
                      ? "hsl(var(--primary-foreground))"
                      : "hsl(var(--foreground))",
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                >
                  {show3DTerrain ? "3D On" : "3D Off"}
                </button>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}

      {/* Layers Panel - Unified FAB + expandable panel */}
      {controlsReady && (
        <div
          style={{
            position: "absolute",
            // Anchored to the fixed nav-footer inset only: opening a JetCard must
            // not shift the FAB. On mobile the card covers this area, so the FAB
            // fades out instead of moving.
            bottom:
              "var(--map-safe-bottom, var(--map-fixed-bottom, calc(60px + 0.75rem)))",
            right: "var(--map-ui-inset-right, 0.75rem)",
            zIndex: 30,
            opacity: isMobile && selectedVenue ? 0 : 1,
            visibility: isMobile && selectedVenue ? "hidden" : "visible",
            pointerEvents: isMobile && selectedVenue ? "none" : "auto",
            transition: "opacity 200ms ease",
          }}
        >
          {/* Expanded panel - slides up from FAB */}
          {(() => {
            const panelBody = (
              <>
                {/* Panel header */}
                {!isMobile && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      position: "sticky",
                      top: 0,
                      background: "hsl(var(--card) / 0.95)",
                      backdropFilter: "blur(24px) saturate(1.6)",
                      WebkitBackdropFilter: "blur(24px) saturate(1.6)",
                      zIndex: 1,
                      paddingBottom: "4px",
                      marginTop: "-2px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "10px",
                        fontWeight: 600,
                        color: "hsl(var(--muted-foreground))",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      Layers
                    </span>
                    <button
                      onClick={() => {
                        triggerHaptic("light");
                        setControlsCollapsed(true);
                      }}
                      style={{
                        width: "20px",
                        height: "20px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: "6px",
                        transition: "background 0.2s",
                        cursor: "pointer",
                        background: "transparent",
                        border: "none",
                      }}
                    >
                      <X
                        style={{
                          width: "12px",
                          height: "12px",
                          color: "hsl(var(--muted-foreground))",
                        }}
                      />
                    </button>
                  </div>
                )}

                {/* Compact live activity summary — always shows live status of
                Density and Movement Paths regardless of toggle state */}
                <div className="chip-summary" role="status" aria-live="polite">
                  {[
                    {
                      key: "density",
                      label: "Density",
                      loading: densityLoading,
                      count: densityData?.stats.grid_cells ?? 0,
                      active: showDensityLayer,
                    },
                    {
                      key: "paths",
                      label: "Paths",
                      loading: pathsLoading,
                      count: pathData?.stats.total_paths ?? 0,
                      active: showMovementPaths,
                    },
                  ].map((chip) => (
                    <div
                      key={chip.key}
                      className="chip-summary-item"
                      title={`${chip.label}: ${chip.loading ? "updating" : chip.count.toLocaleString()}${chip.active ? " (layer on)" : ""}`}
                    >
                      {chip.loading ? (
                        <Loader2
                          aria-hidden
                          className="animate-spin"
                          style={{
                            width: "10px",
                            height: "10px",
                            color: "hsl(var(--primary))",
                            flexShrink: 0,
                          }}
                        />
                      ) : (
                        <span
                          aria-hidden
                          style={{
                            width: "6px",
                            height: "6px",
                            borderRadius: "9999px",
                            flexShrink: 0,
                            background:
                              chip.count > 0
                                ? "hsl(var(--primary))"
                                : "hsl(var(--muted-foreground) / 0.4)",
                            boxShadow:
                              chip.count > 0
                                ? "0 0 6px hsl(var(--primary) / 0.7)"
                                : "none",
                          }}
                        />
                      )}
                      <span
                        className="chip-summary-label"
                        style={{
                          color: chip.active
                            ? "hsl(var(--foreground))"
                            : "hsl(var(--muted-foreground))",
                        }}
                      >
                        {chip.label}
                      </span>
                      <span
                        className="chip-summary-value"
                        style={{ opacity: chip.loading ? 0.5 : 1 }}
                      >
                        {chip.loading ? "…" : chip.count.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Heat toggle row */}
                <LayerToggleRow
                  label="Heatmap"
                  Icon={Layers}
                  active={showDensityLayer}
                  loading={isLoadingHeatmap}
                  ariaLabel="Toggle heatmap layer"
                  tooltip="Shows live crowd density across Charlotte. Red zones are the busiest right now; blue zones are calmer."
                  onToggle={() => {
                    triggerHaptic("medium");
                    applyDensityLayer(!showDensityLayer);
                  }}
                />

                {/* Heat filters - shown when heat is on.
                Overflow flips to `visible` once expanded so the sticky
                time-lapse controls can pin against the panel's scroll
                container instead of being clipped by this collapse wrapper. */}
                <div
                  style={{
                    overflow: showDensityLayer ? "visible" : "hidden",
                    transition: "max-height 0.3s",
                    maxHeight: showDensityLayer ? "1200px" : "0px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "clamp(6px, 1.8vw, 12px)",
                      paddingLeft: "clamp(2px, 1.4vw, 10px)",
                      paddingRight: "clamp(2px, 1vw, 6px)",
                      paddingTop: "clamp(6px, 1.6vw, 10px)",
                      paddingBottom: "4px",
                      minWidth: 0,
                    }}
                  >
                    {/* Time-lapse toggle — glassmorphic pill matching LayerToggleRow */}
                    <button
                      type="button"
                      aria-pressed={timelapseMode}
                      onClick={() => {
                        triggerHaptic("medium");
                        applyTimelapse(!timelapseMode);
                      }}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "7px 10px",
                        borderRadius: "10px",
                        cursor: "pointer",
                        border: timelapseMode
                          ? "1px solid hsl(var(--primary) / 0.45)"
                          : "1px solid hsl(var(--border) / 0.5)",
                        background: timelapseMode
                          ? "linear-gradient(135deg, hsl(var(--primary) / 0.18), hsl(var(--primary-glow) / 0.14))"
                          : "hsl(var(--card) / 0.5)",
                        backdropFilter: "blur(12px) saturate(1.4)",
                        WebkitBackdropFilter: "blur(12px) saturate(1.4)",
                        boxShadow: timelapseMode
                          ? "0 8px 24px -10px hsl(var(--primary) / 0.55), inset 0 0 0 1px hsl(var(--primary-glow) / 0.18)"
                          : "inset 0 0 0 1px hsl(0 0% 100% / 0.03)",
                        transition:
                          "background 220ms cubic-bezier(0.16,1,0.3,1), border-color 220ms ease, box-shadow 220ms ease",
                      }}
                    >
                      <span
                        style={{
                          width: "22px",
                          height: "22px",
                          borderRadius: "7px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          background: timelapseMode
                            ? "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary-glow)))"
                            : "hsl(var(--background) / 0.6)",
                          color: timelapseMode
                            ? "hsl(var(--primary-foreground))"
                            : "hsl(var(--muted-foreground))",
                          border: timelapseMode
                            ? "1px solid transparent"
                            : "1px solid hsl(var(--border) / 0.6)",
                          boxShadow: timelapseMode
                            ? "0 4px 12px -4px hsl(var(--primary) / 0.6)"
                            : "none",
                        }}
                      >
                        <Clock
                          style={{ width: "12px", height: "12px" }}
                          strokeWidth={2.25}
                        />
                      </span>
                      <span
                        className="font-display"
                        style={{
                          flex: 1,
                          textAlign: "left",
                          fontSize: "11px",
                          fontWeight: 700,
                          letterSpacing: "-0.005em",
                          color: timelapseMode
                            ? "hsl(var(--foreground))"
                            : "hsl(var(--foreground) / 0.75)",
                        }}
                      >
                        {timelapseMode ? "Time-lapse On" : "Time-lapse"}
                      </span>
                      <span
                        aria-hidden="true"
                        style={{
                          width: "7px",
                          height: "7px",
                          borderRadius: "9999px",
                          flexShrink: 0,
                          background: timelapseMode
                            ? "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary-glow)))"
                            : "hsl(var(--muted-foreground) / 0.25)",
                          boxShadow: timelapseMode
                            ? "0 0 10px hsl(var(--primary) / 0.7), 0 0 2px hsl(var(--primary-glow) / 0.6)"
                            : "inset 0 0 0 1px hsl(var(--border))",
                        }}
                      />
                    </button>

                    {/* Heatmap refinement sliders — time range narrows the
                    data window (refetch on release) and intensity re-paints
                    the existing layer live. */}
                    <LayerSliderRow
                      label="Time range"
                      Icon={Clock}
                      ariaLabel="Heatmap time range window"
                      min={0}
                      max={HEAT_WINDOW_STEPS.length - 1}
                      step={1}
                      value={heatWindowIndex}
                      onChange={(i) =>
                        setHeatWindowMinutes(HEAT_WINDOW_STEPS[i] ?? null)
                      }
                      format={(i) => formatHeatWindow(HEAT_WINDOW_STEPS[i])}
                      defaultValue={0}
                      ticks={[
                        { value: 0, label: "Auto" },
                        { value: 2, label: "6h" },
                        { value: 4, label: "24h" },
                        { value: 6, label: "7d" },
                      ]}
                      loading={densityLoading}
                      disabled={timelapseMode}
                    />
                    <LayerSliderRow
                      label="Intensity"
                      Icon={Flame}
                      ariaLabel="Heatmap intensity"
                      min={0.5}
                      max={2}
                      step={0.1}
                      value={heatIntensity}
                      onChange={setHeatIntensity}
                      format={(v) => `${v.toFixed(1)}x`}
                      defaultValue={1}
                      ticks={[
                        { value: 0.5, label: "Soft" },
                        { value: 1, label: "1x" },
                        { value: 2, label: "Max" },
                      ]}
                    />

                    {/* Time-lapse controls — glassmorphic card, sticky so playback
                    stays reachable while the layers panel scrolls (mobile
                    sheet + desktop panel). */}
                    {timelapseMode && (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "8px",
                          padding: "10px",
                          borderRadius: "10px",
                          position: "sticky",
                          top: isMobile ? "0px" : "26px",
                          zIndex: 2,
                          background: "hsl(var(--card) / 0.92)",
                          border: "1px solid hsl(var(--border) / 0.5)",
                          backdropFilter: "blur(12px) saturate(1.4)",
                          WebkitBackdropFilter: "blur(12px) saturate(1.4)",
                          boxShadow: "inset 0 0 0 1px hsl(0 0% 100% / 0.03)",
                          // Card fades in when time-lapse is enabled so the mode
                          // switch reads as a transition, not a layout jump.
                          animation:
                            "content-fade-in 240ms cubic-bezier(0.16,1,0.3,1)",
                        }}
                        className={
                          timelapse.loading ? "layer-pending" : undefined
                        }
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              triggerHaptic("light");
                              timelapse.stepBackward();
                            }}
                            disabled={timelapse.isPlaying}
                            style={{
                              width: "26px",
                              height: "26px",
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              borderRadius: "8px",
                              border: "1px solid hsl(var(--border) / 0.6)",
                              background: "hsl(var(--background) / 0.6)",
                              color: "hsl(var(--foreground) / 0.8)",
                              cursor: timelapse.isPlaying
                                ? "not-allowed"
                                : "pointer",
                              opacity: timelapse.isPlaying ? 0.5 : 1,
                            }}
                          >
                            <SkipBack
                              style={{ width: "12px", height: "12px" }}
                            />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              triggerHaptic("medium");
                              if (timelapse.isPlaying) {
                                timelapse.pause();
                              } else {
                                timelapse.play();
                              }
                            }}
                            style={{
                              flex: 1,
                              height: "26px",
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: "4px",
                              borderRadius: "8px",
                              border: timelapse.isPlaying
                                ? "1px solid transparent"
                                : "1px solid hsl(var(--border) / 0.6)",
                              background: timelapse.isPlaying
                                ? "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary-glow)))"
                                : "hsl(var(--background) / 0.6)",
                              color: timelapse.isPlaying
                                ? "hsl(var(--primary-foreground))"
                                : "hsl(var(--foreground))",
                              fontSize: "10px",
                              fontWeight: 700,
                              cursor: "pointer",
                              boxShadow: timelapse.isPlaying
                                ? "0 4px 12px -4px hsl(var(--primary) / 0.6)"
                                : "none",
                            }}
                          >
                            {timelapse.isPlaying ? (
                              <Pause
                                style={{ width: "12px", height: "12px" }}
                              />
                            ) : (
                              <Play style={{ width: "12px", height: "12px" }} />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              triggerHaptic("light");
                              timelapse.stepForward();
                            }}
                            disabled={timelapse.isPlaying}
                            style={{
                              width: "26px",
                              height: "26px",
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              borderRadius: "8px",
                              border: "1px solid hsl(var(--border) / 0.6)",
                              background: "hsl(var(--background) / 0.6)",
                              color: "hsl(var(--foreground) / 0.8)",
                              cursor: timelapse.isPlaying
                                ? "not-allowed"
                                : "pointer",
                              opacity: timelapse.isPlaying ? 0.5 : 1,
                            }}
                          >
                            <SkipForward
                              style={{ width: "12px", height: "12px" }}
                            />
                          </button>
                        </div>
                        <div
                          key={timelapse.currentHour}
                          className="font-display layer-value-transition"
                          aria-live="polite"
                          style={{
                            textAlign: "center",
                            fontSize: "11px",
                            fontWeight: 700,
                            letterSpacing: "0.02em",
                            background:
                              "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary-glow)))",
                            WebkitBackgroundClip: "text",
                            WebkitTextFillColor: "transparent",
                            backgroundClip: "text",
                          }}
                        >
                          {timelapse.formatHour(timelapse.currentHour)}
                        </div>
                        <Slider
                          value={[timelapse.currentHour]}
                          onValueChange={([v]) => timelapse.setHour(v)}
                          min={0}
                          max={23}
                          step={1}
                          className="w-full"
                          disabled={timelapse.isPlaying}
                        />
                        {/* Hour ticks — lightweight scale under the scrubber so the
                        panel stays compact on narrow viewports. */}
                        <div
                          aria-hidden
                          className="flex justify-between px-0.5 text-[8px] tabular-nums text-muted-foreground/70"
                        >
                          {[0, 6, 12, 18, 23].map((h) => (
                            <span key={h}>
                              {h % 12 || 12}
                              {h < 12 ? "a" : "p"}
                            </span>
                          ))}
                        </div>
                        {/* Speed slider — internal `speed` is seconds-per-hour
                        (higher = slower). We expose it as a playback multiplier
                        (higher = faster) via `1 / speed`. */}
                        <LayerSliderRow
                          label="Speed"
                          Icon={Play}
                          ariaLabel="Time-lapse playback speed"
                          min={0.25}
                          max={4}
                          step={0.25}
                          value={Number((1 / timelapse.speed).toFixed(2))}
                          onChange={(mult) => timelapse.setSpeed(1 / mult)}
                          defaultValue={1}
                          format={(mult) => `${mult}x`}
                          ticks={[
                            { value: 0.5, label: "0.5x" },
                            { value: 1, label: "1x" },
                            { value: 2, label: "2x" },
                            { value: 4, label: "4x" },
                          ]}
                        />
                      </div>
                    )}

                    {/* Day-of-week dropdown — density by weekday. "all" = All Days,
                    0..6 = Sun..Sat. Works in both regular and time-lapse mode
                    (useHeatmapTimelapse reuses `dayFilter`). */}
                    {(() => {
                      const fullLabels = [
                        "Sunday",
                        "Monday",
                        "Tuesday",
                        "Wednesday",
                        "Thursday",
                        "Friday",
                        "Saturday",
                      ];
                      const current =
                        dayFilter === undefined ? "all" : String(dayFilter);
                      const dayLoading =
                        densityLoading || (timelapseMode && timelapse.loading);
                      return (
                        <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 backdrop-blur-md">
                          <div className="flex min-w-0 items-center gap-2">
                            <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className="truncate text-sm font-medium">
                              Day of week
                            </span>
                            {dayLoading && (
                              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
                            )}
                          </div>
                          <Select
                            value={current}
                            onValueChange={(v) =>
                              setDayFilter(v === "all" ? undefined : Number(v))
                            }
                          >
                            <SelectTrigger
                              aria-label="Density day-of-week filter"
                              className="h-9 w-[130px] shrink-0 border-white/10 bg-white/5 text-sm"
                            >
                              <span className="truncate">
                                {dayFilter === undefined
                                  ? "All Days"
                                  : fullLabels[dayFilter]}
                              </span>
                            </SelectTrigger>
                            <SelectContent className="z-[10000]">
                              <SelectItem value="all">All Days</SelectItem>
                              {fullLabels.map((label, i) => (
                                <SelectItem key={label} value={String(i)}>
                                  {label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      );
                    })()}

                    {/* Compact color-scale legend — explains the heat ramp now that
                    the intensity/radius/opacity sliders are gone. */}
                    <HeatmapColorLegend
                      loading={isLoadingHeatmap || densityLoading}
                      isLightBasemap={
                        mapStyle === "light" || mapStyle === "streets"
                      }
                    />

                    {/* Density status — loading / error */}
                    {(isLoadingHeatmap || densityError) && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          padding: "6px",
                          borderRadius: "8px",
                          fontSize: "10px",
                          background: densityError
                            ? densityUnauthorized
                              ? "hsl(var(--muted) / 0.5)"
                              : "hsl(var(--destructive) / 0.1)"
                            : "hsl(var(--primary) / 0.08)",
                        }}
                      >
                        {isLoadingHeatmap ? (
                          <>
                            <Loader2
                              className="animate-spin"
                              style={{
                                width: "12px",
                                height: "12px",
                                color: "hsl(var(--primary))",
                                flexShrink: 0,
                              }}
                            />
                            <span style={{ color: "hsl(var(--foreground))" }}>
                              Refreshing heatmap...
                            </span>
                          </>
                        ) : densityUnauthorized ? (
                          <>
                            <AlertCircle
                              style={{
                                width: "12px",
                                height: "12px",
                                color: "hsl(var(--muted-foreground))",
                                flexShrink: 0,
                              }}
                            />
                            <span
                              style={{ color: "hsl(var(--muted-foreground))" }}
                            >
                              Sign in to see live heatmap data
                            </span>
                          </>
                        ) : (
                          <>
                            <AlertCircle
                              style={{
                                width: "12px",
                                height: "12px",
                                color: "hsl(var(--destructive))",
                                flexShrink: 0,
                              }}
                            />
                            <span style={{ color: "hsl(var(--destructive))" }}>
                              Failed
                            </span>
                            <Button
                              onClick={refreshDensity}
                              variant="ghost"
                              size="sm"
                              className="h-5 text-[9px] px-1.5 ml-auto"
                            >
                              Retry
                            </Button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Divider */}
                <div
                  style={{
                    height: "1px",
                    background: "hsl(var(--border) / 0.5)",
                  }}
                />

                {/* Paths toggle row */}
                <LayerToggleRow
                  label="Flow Paths"
                  Icon={Route}
                  active={showMovementPaths}
                  loading={isLoadingPaths}
                  ariaLabel="Toggle flow paths layer"
                  tooltip="Real user movement between venues. Line thickness and glow scale with motion frequency and user frequency — brighter, thicker paths mean more people actively moving that route right now."
                  onToggle={() => {
                    triggerHaptic("medium");
                    applyPathsLayer(!showMovementPaths);
                  }}
                />

                {/* Path filters — container-query driven so the section adapts to
                the layers panel width (sheet on mobile, narrow/wide desktop)
                rather than to the viewport. */}
                <div
                  style={{
                    overflow: showMovementPaths ? "visible" : "hidden",
                    transition: "max-height 0.3s ease, opacity 0.2s ease",
                    maxHeight: showMovementPaths ? "1200px" : "0px",
                    opacity: showMovementPaths ? 1 : 0,
                    containerType: "inline-size",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "clamp(6px, 2.5cqi, 12px)",
                      paddingLeft: "clamp(2px, 3cqi, 10px)",
                      paddingRight: "clamp(2px, 2cqi, 8px)",
                      paddingTop: "clamp(6px, 2.5cqi, 10px)",
                      paddingBottom: "4px",
                      minWidth: 0,
                    }}
                  >
                    {(isLoadingPaths || pathsError) && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          padding: "6px",
                          background: pathsError
                            ? pathsUnauthorized
                              ? "hsl(var(--muted) / 0.5)"
                              : "hsl(var(--destructive) / 0.1)"
                            : "hsl(var(--primary) / 0.08)",
                          borderRadius: "8px",
                          fontSize: "10px",
                        }}
                      >
                        {isLoadingPaths ? (
                          <>
                            <Loader2
                              className="animate-spin"
                              style={{
                                width: "12px",
                                height: "12px",
                                color: "hsl(var(--primary))",
                                flexShrink: 0,
                              }}
                            />
                            <span style={{ color: "hsl(var(--foreground))" }}>
                              Refreshing flow paths...
                            </span>
                          </>
                        ) : pathsUnauthorized ? (
                          <>
                            <AlertCircle
                              style={{
                                width: "12px",
                                height: "12px",
                                color: "hsl(var(--muted-foreground))",
                                flexShrink: 0,
                              }}
                            />
                            <span
                              style={{ color: "hsl(var(--muted-foreground))" }}
                            >
                              Sign in to see live flow paths
                            </span>
                          </>
                        ) : (
                          <>
                            <AlertCircle
                              style={{
                                width: "12px",
                                height: "12px",
                                color: "hsl(var(--destructive))",
                                flexShrink: 0,
                              }}
                            />
                            <span style={{ color: "hsl(var(--destructive))" }}>
                              Failed
                            </span>
                            <Button
                              onClick={refreshPaths}
                              variant="ghost"
                              size="sm"
                              className="h-5 text-[9px] px-1.5 ml-auto"
                            >
                              Retry
                            </Button>
                          </>
                        )}
                      </div>
                    )}
                    {/* Explainer lives in the Flow Paths toggle tooltip only. */}
                    {/* Min-frequency slider — brought into the LayerSliderRow
                    system so it matches the rest of the panel visually and
                    inherits the reset/tick/adaptive-spacing behavior. */}
                    <LayerSliderRow
                      label="User flow paths by frequency"
                      Icon={Route}
                      ariaLabel="User flow paths by frequency (1-10 users)"
                      min={1}
                      max={10}
                      step={1}
                      value={minPathFrequency}
                      onChange={setMinPathFrequency}
                      format={(v) => `${v}+ users`}
                      ticks={[
                        { value: 1, label: "1" },
                        { value: 3, label: "3" },
                        { value: 5, label: "5" },
                        { value: 10, label: "10" },
                      ]}
                      defaultValue={2}
                      loading={pathsLoading}
                    />
                    {/* Compact movement summary — wraps cleanly at any width. */}
                    {pathData?.stats && (
                      <div
                        style={{
                          paddingTop: "6px",
                          borderTop: "1px solid hsl(var(--border) / 0.3)",
                          display: "grid",
                          gridTemplateColumns:
                            "repeat(auto-fit, minmax(64px, 1fr))",
                          gap: "clamp(2px, 1.5cqi, 8px)",
                          fontSize: "clamp(8px, 2.4cqi, 10px)",
                        }}
                        className="text-muted-foreground"
                      >
                        <span className="truncate">
                          {pathData.stats.total_paths} routes
                        </span>
                        <span className="truncate">
                          {pathData.stats.unique_users} users
                        </span>
                        <span className="truncate">
                          peak {pathData.stats.max_frequency}x
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Divider */}
                <div
                  style={{
                    height: "1px",
                    background: "hsl(var(--border) / 0.5)",
                  }}
                />

                {/* Parking toggle row */}
                <LayerToggleRow
                  label="Parking"
                  Icon={Car}
                  active={showParking}
                  ariaLabel="Toggle parking layer"
                  tooltip="Displays nearby parking options around venues so you can plan your arrival."
                  onToggle={() => {
                    triggerHaptic("medium");
                    applyParkingLayer(!showParking);
                  }}
                />

                {/* Divider */}
                <div
                  style={{
                    height: "1px",
                    background: "hsl(var(--border) / 0.5)",
                  }}
                />

                {/* Live Stats toggle row */}
                <LayerToggleRow
                  label="Live Stats"
                  Icon={BarChart3}
                  active={showLiveStats}
                  loading={isLoadingStats}
                  ariaLabel="Toggle live stats panel"
                  tooltip="Actionable insights from live activity: busiest hotspots right now, momentum trend vs. the last hour, top movement routes, and recent JET member check-ins to help you decide where to go next."
                  onToggle={() => {
                    triggerHaptic("medium");
                    applyLiveStats(!showLiveStats);
                  }}
                />

                {/* Live Stats renders on the left side of the map (see the floating
                panel below) so it never obstructs this Layers container. */}

                {/* Reset to defaults */}
                <button
                  type="button"
                  onClick={handleResetToDefaults}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    padding: "6px 8px",
                    borderRadius: "8px",
                    border: "1px solid hsl(var(--border) / 0.4)",
                    background: "transparent",
                    color: "hsl(var(--muted-foreground))",
                    fontSize: "10px",
                    fontWeight: 600,
                    letterSpacing: "0.02em",
                    cursor: "pointer",
                    transition:
                      "color 200ms ease, border-color 200ms ease, background 200ms ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = "hsl(var(--foreground))";
                    e.currentTarget.style.borderColor =
                      "hsl(var(--border) / 0.7)";
                    e.currentTarget.style.background = "hsl(var(--card) / 0.4)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color =
                      "hsl(var(--muted-foreground))";
                    e.currentTarget.style.borderColor =
                      "hsl(var(--border) / 0.4)";
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  <RotateCcw style={{ width: "12px", height: "12px" }} />
                  Reset to defaults
                </button>
              </>
            );
            if (isMobile) {
              return (
                <Sheet
                  open={!controlsCollapsed}
                  onOpenChange={(o) => setControlsCollapsed(!o)}
                >
                  <SheetContent
                    side="bottom"
                    overlayClassName="bg-background/25 backdrop-blur-[2px]"
                    className="p-0 rounded-t-2xl border-t bg-card/85 backdrop-blur-xl shadow-2xl"
                    style={{
                      maxHeight: "min(52dvh, 420px)",
                      paddingBottom: "env(safe-area-inset-bottom)",
                    }}
                  >
                    <div
                      aria-hidden
                      className="mx-auto mt-2 h-1 w-10 rounded-full bg-muted-foreground/40"
                    />
                    <SheetHeader className="px-4 pt-2 pb-1.5">
                      <SheetTitle className="font-display text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground text-left">
                        Map Layers
                      </SheetTitle>
                    </SheetHeader>
                    <div
                      style={{
                        padding:
                          "clamp(2px, 1vw, 5px) clamp(10px, 3.2vw, 14px) clamp(12px, 3.2vw, 16px)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "clamp(6px, 1.8vw, 9px)",
                        overflowY: "auto",
                        WebkitOverflowScrolling: "touch",
                        maxHeight:
                          "calc(min(52dvh, 420px) - 62px - env(safe-area-inset-bottom))",
                        overscrollBehavior: "contain",
                      }}
                    >
                      {panelBody}
                    </div>
                  </SheetContent>
                </Sheet>
              );
            }
            return (
              <div
                style={{
                  width: `${panelWidth}px`,
                  contain: "layout style",
                  overflow: "hidden",
                  transition:
                    "max-height 300ms ease-out, opacity 300ms ease-out, margin-bottom 300ms ease-out",
                  maxHeight: !controlsCollapsed ? `${panelMaxH}px` : "0px",
                  opacity: !controlsCollapsed ? 1 : 0,
                  marginBottom: !controlsCollapsed ? "8px" : "0px",
                }}
              >
                <div
                  style={{
                    background: "hsl(var(--card) / 0.95)",
                    backdropFilter: "blur(24px) saturate(1.6)",
                    WebkitBackdropFilter: "blur(24px) saturate(1.6)",
                    borderRadius: "12px",
                    border: "1px solid hsl(var(--border))",
                    boxShadow:
                      "0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)",
                    padding: `${panelPad}px`,
                    display: "flex",
                    flexDirection: "column",
                    gap: `${panelGap}px`,
                    maxHeight:
                      "calc(100dvh - var(--map-fixed-bottom, 72px) - 252px)",
                    overflowY: "auto",
                    overscrollBehavior: "contain",
                  }}
                >
                  {panelBody}
                </div>
              </div>
            );
          })()}

          {/* Quick-toggle chips — visible when panel is collapsed. Heatmap &
            Flow Paths are interactive so users can flip the two primary
            layers without opening the full panel. Parking / Live Stats stay
            as read-only status pills to avoid crowding the FAB row. */}
          {controlsCollapsed && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                marginBottom: "8px",
                justifyContent: "flex-end",
              }}
            >
              <button
                type="button"
                aria-label={`${showDensityLayer ? "Hide" : "Show"} heatmap layer`}
                aria-pressed={showDensityLayer}
                onClick={(e) => {
                  e.stopPropagation();
                  triggerHaptic("medium");
                  applyDensityLayer(!showDensityLayer);
                }}
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "9px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  border: showDensityLayer
                    ? "1px solid transparent"
                    : "1px solid hsl(var(--border))",
                  background: showDensityLayer
                    ? "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary-glow)))"
                    : "hsl(var(--card) / 0.85)",
                  color: showDensityLayer
                    ? "hsl(var(--primary-foreground))"
                    : "hsl(var(--muted-foreground))",
                  boxShadow: showDensityLayer
                    ? "0 4px 12px -2px hsl(var(--primary) / 0.5)"
                    : "inset 0 0 0 1px hsl(0 0% 100% / 0.03)",
                  backdropFilter: "blur(12px) saturate(1.4)",
                  WebkitBackdropFilter: "blur(12px) saturate(1.4)",
                  transition:
                    "background 200ms ease, color 200ms ease, box-shadow 200ms ease, transform 200ms ease",
                  padding: 0,
                }}
              >
                <Layers
                  style={{ width: "15px", height: "15px" }}
                  strokeWidth={2.25}
                />
              </button>
              <button
                type="button"
                aria-label={`${showMovementPaths ? "Hide" : "Show"} flow paths layer`}
                aria-pressed={showMovementPaths}
                onClick={(e) => {
                  e.stopPropagation();
                  triggerHaptic("medium");
                  applyPathsLayer(!showMovementPaths);
                }}
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "9px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  border: showMovementPaths
                    ? "1px solid transparent"
                    : "1px solid hsl(var(--border))",
                  background: showMovementPaths
                    ? "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary-glow)))"
                    : "hsl(var(--card) / 0.85)",
                  color: showMovementPaths
                    ? "hsl(var(--primary-foreground))"
                    : "hsl(var(--muted-foreground))",
                  boxShadow: showMovementPaths
                    ? "0 4px 12px -2px hsl(var(--primary) / 0.5)"
                    : "inset 0 0 0 1px hsl(0 0% 100% / 0.03)",
                  backdropFilter: "blur(12px) saturate(1.4)",
                  WebkitBackdropFilter: "blur(12px) saturate(1.4)",
                  transition:
                    "background 200ms ease, color 200ms ease, box-shadow 200ms ease, transform 200ms ease",
                  padding: 0,
                }}
              >
                <Route
                  style={{ width: "15px", height: "15px" }}
                  strokeWidth={2.25}
                />
              </button>
              <button
                type="button"
                aria-label={`${showParking ? "Hide" : "Show"} parking layer`}
                aria-pressed={showParking}
                onClick={(e) => {
                  e.stopPropagation();
                  triggerHaptic("medium");
                  applyParkingLayer(!showParking);
                }}
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "9px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  border: showParking
                    ? "1px solid transparent"
                    : "1px solid hsl(var(--border))",
                  background: showParking
                    ? "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary-glow)))"
                    : "hsl(var(--card) / 0.85)",
                  color: showParking
                    ? "hsl(var(--primary-foreground))"
                    : "hsl(var(--muted-foreground))",
                  boxShadow: showParking
                    ? "0 4px 12px -2px hsl(var(--primary) / 0.5)"
                    : "inset 0 0 0 1px hsl(0 0% 100% / 0.03)",
                  backdropFilter: "blur(12px) saturate(1.4)",
                  WebkitBackdropFilter: "blur(12px) saturate(1.4)",
                  transition:
                    "background 200ms ease, color 200ms ease, box-shadow 200ms ease, transform 200ms ease",
                  padding: 0,
                }}
              >
                <Car
                  style={{ width: "15px", height: "15px" }}
                  strokeWidth={2.25}
                />
              </button>
              <button
                type="button"
                aria-label={`${showLiveStats ? "Hide" : "Show"} live stats`}
                aria-pressed={showLiveStats}
                onClick={(e) => {
                  e.stopPropagation();
                  triggerHaptic("medium");
                  applyLiveStats(!showLiveStats);
                }}
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "9px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  border: showLiveStats
                    ? "1px solid transparent"
                    : "1px solid hsl(var(--border))",
                  background: showLiveStats
                    ? "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary-glow)))"
                    : "hsl(var(--card) / 0.85)",
                  color: showLiveStats
                    ? "hsl(var(--primary-foreground))"
                    : "hsl(var(--muted-foreground))",
                  boxShadow: showLiveStats
                    ? "0 4px 12px -2px hsl(var(--primary) / 0.5)"
                    : "inset 0 0 0 1px hsl(0 0% 100% / 0.03)",
                  backdropFilter: "blur(12px) saturate(1.4)",
                  WebkitBackdropFilter: "blur(12px) saturate(1.4)",
                  transition:
                    "background 200ms ease, color 200ms ease, box-shadow 200ms ease, transform 200ms ease",
                  padding: 0,
                }}
              >
                {isLoadingStats ? (
                  <Loader2
                    className="animate-spin"
                    style={{ width: "15px", height: "15px" }}
                  />
                ) : (
                  <BarChart3
                    style={{ width: "15px", height: "15px" }}
                    strokeWidth={2.25}
                  />
                )}
              </button>
            </div>
          )}

          {/* Layers FAB */}
          <button
            onClick={() => {
              triggerHaptic("light");
              setControlsCollapsed(!controlsCollapsed);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "12px",
              boxShadow:
                showDensityLayer || showMovementPaths || showParking
                  ? "0 20px 25px -5px hsl(var(--primary) / 0.4)"
                  : "0 20px 25px -5px rgba(0,0,0,0.1)",
              transition: "all 0.2s",
              width: "var(--touch-target-min, 44px)",
              height: "var(--touch-target-min, 44px)",
              marginLeft: "auto",
              cursor: "pointer",
              position: "relative",
              border:
                showDensityLayer || showMovementPaths || showParking
                  ? "none"
                  : "1px solid hsl(var(--border))",
              background:
                showDensityLayer || showMovementPaths || showParking
                  ? "hsl(var(--primary))"
                  : "hsl(var(--card))",
              color:
                showDensityLayer || showMovementPaths || showParking
                  ? "hsl(var(--primary-foreground))"
                  : "hsl(var(--foreground))",
              backdropFilter:
                showDensityLayer || showMovementPaths || showParking
                  ? "none"
                  : "blur(24px) saturate(1.6)",
              WebkitBackdropFilter:
                showDensityLayer || showMovementPaths || showParking
                  ? "none"
                  : "blur(24px) saturate(1.6)",
            }}
            aria-label={
              controlsCollapsed ? "Open layers panel" : "Close layers panel"
            }
          >
            {controlsCollapsed ? (
              <Layers style={{ width: "20px", height: "20px" }} />
            ) : (
              <X style={{ width: "20px", height: "20px" }} />
            )}
          </button>
        </div>
      )}

      {/* Live Stats — always rendered on the left side of the map, clear of the
          Layers container (bottom-right) and the map nav controls (top-right). */}
      {showDensityLayer && inspectedCell && !(isMobile && selectedVenue) && (
        <div
          className="absolute left-1/2 -translate-x-1/2 pointer-events-none"
          style={{
            bottom: `calc(var(--map-safe-bottom, calc(var(--bottom-nav-total-height, 60px) + 1rem)) + ${Math.round(inspectorHeight || 140) + 22}px)`,
            zIndex: 34,
            transition: "bottom 220ms cubic-bezier(0.16,1,0.3,1)",
          }}
        >
          <HeatFilterChips
            value={timeFilter}
            onChange={(next) => {
              setTimeFilter(next);
              scheduleDensityRefresh();
            }}
            loading={densityLoading}
          />
        </div>
      )}

      {showDensityLayer && !(isMobile && selectedVenue) && (
        <HeatCellInspector
          cell={inspectedCell}
          cityLabel={selectedCity?.name}
          isLightBasemap={mapStyle === "light" || mapStyle === "streets"}
          onClose={() => setInspectedCell(null)}
          onHeightChange={setInspectorHeight}
          onZoomTo={(cell) => {
            map.current?.flyTo({
              center: [cell.lng, cell.lat],
              zoom: Math.max(map.current.getZoom(), 15),
              duration: 900,
            });
          }}
        />
      )}

      {showLiveStats && (
        <LiveStatsPanel
          open={showLiveStats}
          mapLoaded={mapLoaded}
          isMobile={isMobile}
          densityData={densityData}
          pathData={pathData}
          showDensityLayer={showDensityLayer}
          showMovementPaths={showMovementPaths}
          densityLoading={densityLoading}
          pathLoading={pathsLoading}
          topHotspot={topHotspot}
          topRoute={topRoute ? { frequency: topRoute.frequency } : null}
          onJumpToHotspot={handleJumpToHotspot}
          onHighlightTopRoute={handleHighlightTopRoute}
          range={liveStatsRange}
          onRangeChange={handleLiveStatsRangeChange}
        />
      )}

      {/* Enhanced Legend - Bottom left, responsive for all devices, collapsible on mobile */}
      {/* CRITICAL: Uses only opacity transition to avoid CLS - no translate animations */}
      <div
        style={{
          position: "absolute",
          // The attribution/logo row is hidden, so the legend uses the same
          // uniform nav-footer padding as every other bottom overlay.
          bottom: "var(--map-safe-bottom, var(--map-fixed-bottom))",
          left: "var(--map-ui-inset-left)",
          maxWidth: "var(--map-control-max-width)",
          width: "clamp(160px, 38vw, 240px)",
          zIndex: 30,
          // Dark luxe legend — vertical gradient surface, hairline border,
          // soft ambient gold glow, inset highlight for refined depth.
          background:
            "linear-gradient(180deg, hsl(var(--card) / 0.95), hsl(var(--card) / 0.82))",
          backdropFilter: "blur(24px) saturate(1.6)",
          WebkitBackdropFilter: "blur(24px) saturate(1.6)",
          borderRadius: "12px",
          border: "1px solid hsl(0 0% 100% / 0.06)",
          boxShadow:
            "0 0 60px hsl(var(--gold) / 0.06), 0 14px 30px -12px rgba(0,0,0,0.7), inset 0 1px 0 hsl(0 0% 100% / 0.05)",
          padding: isMobile ? "6px 8px" : "8px 12px",
          opacity: mapLoaded && (isMobile ? !selectedVenue : true) ? 1 : 0,
          visibility:
            mapLoaded && (isMobile ? !selectedVenue : true)
              ? "visible"
              : "hidden",
          transition: "opacity 300ms ease-out, visibility 300ms ease-out",
          transform: "translateZ(0)",
          willChange: "opacity",
          pointerEvents:
            mapLoaded && (isMobile ? !selectedVenue : true) ? "auto" : "none",
          cursor: isMobile ? "pointer" : undefined,
        }}
        onClick={
          isMobile
            ? () => {
                triggerHaptic("light");
                setLegendCollapsed(!legendCollapsed);
              }
            : undefined
        }
      >
        {isMobile && legendCollapsed ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              cursor: "pointer",
            }}
          >
            <span
              style={{
                fontSize: "9px",
                fontWeight: 500,
                color: "hsl(var(--gold))",
                textTransform: "uppercase",
                letterSpacing: "0.12em",
              }}
            >
              Legend
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              {/* Same palette the venue markers use, resolved for this basemap. */}
              {activityLegendTiers(
                mapStyle === "light" || mapStyle === "streets",
              ).map((tier) => (
                <div
                  key={tier.id}
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    background: tier.color,
                    boxShadow: `0 0 0 1.5px ${casingFor(mapStyle === "light" || mapStyle === "streets")}`,
                  }}
                />
              ))}
            </div>
            <ChevronUp
              style={{
                width: "12px",
                height: "12px",
                color: "hsl(var(--silver))",
              }}
            />
          </div>
        ) : (
          <>
            {isMobile && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  marginBottom: "4px",
                  cursor: "pointer",
                }}
              >
                <ChevronDown
                  style={{
                    width: "12px",
                    height: "12px",
                    color: "hsl(var(--silver))",
                  }}
                />
              </div>
            )}

            {showMovementPaths ? (
              <>
                <p
                  style={{
                    fontSize: "clamp(9px, 2.4vw, 11px)",
                    fontWeight: 600,
                    color: "hsl(var(--gold))",
                    marginBottom: "6px",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    textAlign: "center",
                    width: "100%",
                  }}
                >
                  User Flow Paths
                </p>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                    width: "100%",
                  }}
                >
                  <div
                    style={{
                      width: "100%",
                      minWidth: 0,
                      height: "clamp(12px, 3.2vw, 16px)",
                      borderRadius: "6px",
                      // Mirrors the flow-path line ramp exactly.
                      background:
                        "linear-gradient(to right, rgb(178, 196, 255), rgb(150, 138, 255), rgb(196, 112, 255), rgb(255, 106, 178), rgb(255, 178, 74))",
                      border: "1px solid hsl(0 0% 100% / 0.14)",
                      boxShadow:
                        "inset 0 1px 3px rgba(0,0,0,0.35), 0 0 14px rgba(196,112,255,0.22)",
                    }}
                  />
                  <div
                    style={{
                      display: "flex",
                      width: "100%",
                      fontSize: "clamp(8px, 2.2vw, 10px)",
                      color: "hsl(var(--muted-foreground))",
                      fontWeight: 500,
                    }}
                  >
                    <span style={{ flex: 1, textAlign: "left" }}>
                      Occasional
                    </span>
                    <span style={{ flex: 1, textAlign: "center" }}>
                      Frequent
                    </span>
                    <span style={{ flex: 1, textAlign: "right" }}>Busiest</span>
                  </div>
                </div>
              </>
            ) : showDensityLayer ? (
              <>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    marginBottom: "6px",
                  }}
                >
                  <p
                    style={{
                      fontSize: "10px",
                      fontWeight: 600,
                      color: "hsl(var(--gold))",
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      textAlign: "center",
                    }}
                  >
                    {timelapseMode ? "Time-lapse" : "User Density Heatmap"}
                  </p>
                  {timelapseMode && timelapse.isPlaying && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      <div
                        className="animate-pulse"
                        style={{
                          width: "6px",
                          height: "6px",
                          background: "hsl(var(--primary))",
                          borderRadius: "50%",
                        }}
                      />
                      <span
                        style={{
                          fontSize: "9px",
                          color: "hsl(var(--primary))",
                          fontWeight: 500,
                        }}
                      >
                        {timelapse.formatHour(timelapse.currentHour)}
                      </span>
                    </div>
                  )}
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                    width: "100%",
                  }}
                >
                  <div
                    style={{
                      width: "100%",
                      minWidth: 0,
                      height: "14px",
                      borderRadius: "6px",
                      background:
                        "linear-gradient(to right, rgba(65, 105, 225, 0.8), rgb(0, 255, 127), rgb(255, 255, 0), rgb(255, 165, 0), rgb(255, 0, 0), rgb(139, 0, 0))",
                      border: "1px solid hsl(var(--gold) / 0.35)",
                      boxShadow:
                        "inset 0 1px 3px rgba(0,0,0,0.3), 0 0 12px hsl(var(--gold) / 0.15)",
                    }}
                  />
                  <div
                    style={{
                      display: "flex",
                      width: "100%",
                      fontSize: "9px",
                      color: "hsl(var(--muted-foreground))",
                      fontWeight: 500,
                    }}
                  >
                    <span style={{ flex: 1, textAlign: "center" }}>Low</span>
                    <span style={{ flex: 1, textAlign: "center" }}>Medium</span>
                    <span style={{ flex: 1, textAlign: "center" }}>High</span>
                  </div>
                </div>
              </>
            ) : (
              <div
                style={{ display: "flex", flexDirection: "column", gap: "4px" }}
              >
                <p
                  style={{
                    fontSize: "9px",
                    fontWeight: 600,
                    color: "hsl(var(--gold))",
                    marginBottom: "4px",
                    textTransform: "uppercase",
                    letterSpacing: "0.12em",
                    textAlign: "center",
                    width: "100%",
                  }}
                >
                  Activity
                </p>
                {/* Four tiers, same palette and casing as the venue markers.
                    Two columns on mobile so the extra tier costs no height. */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: isMobile
                      ? "1fr 1fr"
                      : "repeat(4, auto)",
                    gap: isMobile ? "4px 8px" : "8px",
                    width: "100%",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  {activityLegendTiers(
                    mapStyle === "light" || mapStyle === "streets",
                  ).map((tier) => (
                    <div
                      key={tier.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      <div
                        style={{
                          width: "8px",
                          height: "8px",
                          flexShrink: 0,
                          borderRadius: "50%",
                          background: tier.color,
                          boxShadow: `0 0 0 1.5px ${casingFor(mapStyle === "light" || mapStyle === "streets")}`,
                        }}
                      />
                      <span
                        style={{
                          fontSize: "9px",
                          color: "hsl(var(--foreground))",
                        }}
                      >
                        {tier.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Enhanced animations and styles */}
      <style>{`
        /* CLS-safe fadeIn animation - opacity only, no transforms */
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        @keyframes pulse {
          0%, 100% {
            transform: scale(1);
            opacity: 1;
          }
          50% {
            transform: scale(1.05);
            opacity: 0.9;
          }
        }
        
        @keyframes bounce {
          0%, 100% {
            transform: scale(1);
          }
          25% {
            transform: scale(1.15);
          }
          50% {
            transform: scale(0.95);
          }
          75% {
            transform: scale(1.05);
          }
        }
        
        .venue-marker-container {
          position: relative;
        }
        
        .heatmap-glow {
          animation: heatmap-pulse 3s ease-in-out infinite;
        }
        
        /* Disable animations for reduced motion preference */
        @media (prefers-reduced-motion: reduce) {
          .heatmap-glow {
            animation: none;
          }
        }
        
        .heatmap-glow-0 {
          animation-delay: 0s;
        }
        
        .heatmap-glow-1 {
          animation-delay: 0.2s;
        }
        
        .heatmap-glow-2 {
          animation-delay: 0.4s;
        }
        
        @keyframes heatmap-pulse {
          0%, 100% {
            transform: scale(1);
            opacity: 0;
          }
          50% {
            transform: scale(1.2);
            opacity: 0.3;
          }
        }
        
        /* Popup styling - responsive */
        .mapboxgl-popup-content {
          background: hsl(var(--card) / 0.96) !important;
          backdrop-filter: blur(16px) saturate(180%) !important;
          -webkit-backdrop-filter: blur(16px) saturate(180%) !important;
          border-radius: 16px !important;
          border: 1px solid hsl(var(--border)) !important;
          box-shadow: 0 12px 40px hsl(var(--foreground) / 0.15), 0 0 0 1px hsl(var(--border) / 0.3) inset !important;
          padding: 0 !important;
          overflow: hidden;
        }
        
        .mapboxgl-popup-close-button {
          color: hsl(var(--muted-foreground)) !important;
          font-size: 20px !important;
          padding: 6px 10px !important;
          right: 4px !important;
          top: 4px !important;
          transition: color 0.2s ease !important;
        }
        
        .mapboxgl-popup-close-button:hover {
          color: hsl(var(--foreground)) !important;
          background: hsl(var(--muted) / 0.5) !important;
          border-radius: 6px !important;
        }
        
        .mapboxgl-popup-tip {
          border-top-color: hsl(var(--card) / 0.96) !important;
        }
        
        .venue-popup .mapboxgl-popup-content {
          animation: popup-fade-in 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }
        
        @keyframes popup-fade-in {
          from {
            opacity: 0;
            transform: translateY(-8px) scale(0.96);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        
        /* Responsive popup sizing */
        @media (max-width: 480px) {
          .mapboxgl-popup-content {
            border-radius: 14px !important;
          }
          .mapboxgl-popup-close-button {
            font-size: 18px !important;
            padding: 4px 8px !important;
          }
        }
        
        @media (min-width: 768px) {
          .mapboxgl-popup-content {
            border-radius: 18px !important;
          }
        }
        
        /* Glassmorphic scrollbar styling for filter panels */
        .scroll-smooth::-webkit-scrollbar {
          width: 4px;
        }
        
        .scroll-smooth::-webkit-scrollbar-track {
          background: transparent;
          border-radius: 2px;
        }
        
        .scroll-smooth::-webkit-scrollbar-thumb {
          background: hsl(var(--primary) / 0.3);
          border-radius: 2px;
          transition: background 0.2s ease;
        }
        
        .scroll-smooth::-webkit-scrollbar-thumb:hover {
          background: hsl(var(--primary) / 0.5);
        }
        
        .scroll-smooth::-webkit-scrollbar-thumb:active {
          background: hsl(var(--primary) / 0.7);
        }
        
        /* Firefox scrollbar */
        .scroll-smooth {
          scrollbar-width: thin;
          scrollbar-color: hsl(var(--primary) / 0.3) transparent;
        }
      `}</style>
    </div>
  );
};
