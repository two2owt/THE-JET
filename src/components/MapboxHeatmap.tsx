import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { storeLastKnownLocation } from "@/lib/tile-prefetch";
import type * as MapboxGL from "mapbox-gl";

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
    if (typeof window !== 'undefined' && (window as any).mapboxgl) {
      resolve((window as any).mapboxgl);
      return;
    }
    
    // Poll every 100ms for up to CDN_LOAD_TIMEOUT
    const startTime = Date.now();
    const checkInterval = setInterval(() => {
      if (typeof window !== 'undefined' && (window as any).mapboxgl) {
        clearInterval(checkInterval);
        resolve((window as any).mapboxgl);
      } else if (Date.now() - startTime > CDN_LOAD_TIMEOUT) {
        clearInterval(checkInterval);
        console.warn('MapboxHeatmap: CDN load timeout, falling back to bundled version');
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
        console.log('MapboxHeatmap: Using CDN mapbox-gl');
        mapboxglModule = cdnMapbox;
        return mapboxglModule;
      }
      
      // Fallback to dynamic import (development or if CDN fails)
      console.log('MapboxHeatmap: Loading mapbox-gl via import');
      try {
        const m = await import("mapbox-gl");
        // Also load the CSS in dev
        await import("mapbox-gl/dist/mapbox-gl.css");
        mapboxglModule = m.default;
        return m.default;
      } catch (importError) {
        console.error('MapboxHeatmap: Failed to import mapbox-gl:', importError);
        throw new Error('Failed to load map library. Please check your connection and refresh.');
      }
    })();
  }
  return mapboxLoadPromise;
};
import { MapPin, Layers, Palette, X, AlertCircle, Route, Play, Pause, SkipBack, SkipForward, Clock, ChevronDown, ChevronUp, Car, BarChart3, RotateCcw, Calendar, Loader2, CircleDot } from "lucide-react";
import { HeatmapSkeleton } from "@/components/skeletons/HeatmapSkeleton";
import { useLocationDensity } from "@/hooks/useLocationDensity";
import { useMovementPaths } from "@/hooks/useMovementPaths";
import { useHeatmapTimelapse } from "@/hooks/useHeatmapTimelapse";
import { useBreakpointUp } from "@/hooks/useBreakpoint";
import { useOpenVenues } from "@/hooks/useOpenVenues";
import { supabase } from "@/integrations/supabase/client";
import { triggerHaptic } from "@/lib/haptics";
import { buildVenueOpenStatus } from "@/lib/venue-open-cache";
import { useOpenNowTick } from "@/hooks/useOpenNowTick";
import { Button } from "./ui/button";
import { LayerToggleRow } from "./map/LayerToggleRow";
import { LayerSliderRow } from "./map/LayerSliderRow";
import { LiveStatsPanel } from "./map/LiveStatsPanel";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Slider } from "./ui/slider";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";
import { Input } from "./ui/input";
import { Search } from "lucide-react";

import { CITIES, type City, getNearestCity, getCitiesSortedByDistance, kmToMiles } from "@/types/cities";
import { getCachedReverseGeocode } from "@/utils/reverseGeocode";
import locationPuckIcon from "@/assets/location-puck.png";

// Re-export Venue type for backwards compatibility
export type { Venue } from "@/types/venue";
import type { Venue } from "@/types/venue";

interface MapboxHeatmapProps {
  onVenueSelect: (venue: Venue) => void;
  onParkingSelect?: (parking: { lat: number; lng: number; name?: string }) => void;
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

const getActivityColor = (activity: number) => {
  // Brighter, more saturated colors for better visibility on dark map
  if (activity >= 80) return "hsl(0, 100%, 65%)"; // hot red - bright coral
  if (activity >= 60) return "hsl(45, 100%, 60%)"; // warm yellow-orange 
  return "hsl(200, 100%, 65%)"; // cool blue - vibrant sky blue
};

// Platform detection for optimized settings
const getPlatformSettings = (isMobile: boolean) => {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isAndroid = /Android/.test(navigator.userAgent);
  const isPWA = window.matchMedia('(display-mode: standalone)').matches;
  const isLowPowerMode = 'connection' in navigator && (navigator as any).connection?.saveData;
  const hasReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isSlowConnection = 'connection' in navigator && 
    ['slow-2g', '2g', '3g'].includes((navigator as any).connection?.effectiveType);
  
  return {
    // Reduce pitch on mobile for better performance
    pitch: isMobile ? (isLowPowerMode ? 0 : 30) : 50,
    // Disable antialiasing on mobile for performance
    antialias: !isMobile && !isLowPowerMode,
    // Fade duration - instant on mobile/low power
    fadeDuration: (isMobile || isLowPowerMode || hasReducedMotion) ? 0 : 100,
    // Tile cache - smaller on mobile, larger on desktop for better caching
    maxTileCacheSize: isMobile ? 25 : 150,
    // Cooperative gestures disabled - allow single finger pan on all devices
    cooperativeGestures: false,
    // Touch controls
    touchZoomRotate: true,
    touchPitch: !isMobile,
    dragRotate: !isMobile,
    // Animation durations
    flyToDuration: hasReducedMotion ? 0 : (isMobile ? 1000 : 1500),
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

export const MapboxHeatmap = ({ onVenueSelect, onParkingSelect, venues: allVenues, mapboxToken, selectedCity, onCityChange, onNearestCityDetected, onDetectedLocationNameChange, isLoadingVenues = false, selectedVenue, resetUIKey }: MapboxHeatmapProps) => {
  // Filter venues by Google Places opening hours against the device's local
  // time. Markers (and the underlying heatmap source) automatically refresh
  // every minute as venues open/close. Venues without parseable hours stay
  // visible (fail-open) so unknown data doesn't blank out the map.
  const venues = useOpenVenues(allVenues);
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<MapboxGL.Map | null>(null);
  const mapboxglRef = useRef<MapboxGLModule | null>(null);
  const [mapboxLoaded, setMapboxLoaded] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapInitializing, setMapInitializing] = useState(true);
  // Drives the single crossfade from HeatmapSkeleton -> interactive map.
  // Stays true until the opacity transition completes after mapLoaded flips.
  const [skeletonMounted, setSkeletonMounted] = useState(true);
  const [loadingStage, setLoadingStage] = useState<'module' | 'init' | 'style' | 'ready'>('module');
  const [mapError, setMapError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const userMarker = useRef<MapboxGL.Marker | null>(null);
  const markersRef = useRef<MapboxGL.Marker[]>([]);
  const dealMarkersRef = useRef<MapboxGL.Marker[]>([]);
  // Tracks the currently-open marker chip so we can close prior chips cleanly
  // when selection changes or the user taps elsewhere on the map.
  const activeChipRef = useRef<{ el: HTMLElement; venueId: string; hide: () => void } | null>(null);
  const [venueDealCounts, setVenueDealCounts] = useState<Record<string, number>>({});
  const geolocateControlRef = useRef<MapboxGL.GeolocateControl | null>(null);
  const onVenueSelectRef = useRef(onVenueSelect);
  onVenueSelectRef.current = onVenueSelect;
  const onParkingSelectRef = useRef(onParkingSelect);
  onParkingSelectRef.current = onParkingSelect;
  const flowAnimationRef = useRef<number | null>(null);
  // Treat anything below the `md` breakpoint as a phone-class device for
  // Mapbox tuning: lower tile cache, disabled rotate/pitch, faster fades.
  // Tablets (md+) get the desktop-grade settings.
  const isMobile = !useBreakpointUp("md");
  const initStartTime = useRef<number>(0);
  const platformSettings = useRef(getPlatformSettings(isMobile));
  
  // Load mapbox-gl module on mount (deferred to reduce TBT)
  useEffect(() => {
    let mounted = true;
    loadMapboxGL().then((mapboxgl) => {
      if (mounted) {
        mapboxglRef.current = mapboxgl;
        setMapboxLoaded(true);
        setLoadingStage('init');
        console.log('MapboxHeatmap: mapbox-gl module loaded');
      }
    }).catch((err) => {
      console.error('MapboxHeatmap: Failed to load mapbox-gl:', err);
      // Provide user-friendly error messages
      const errorMessage = err?.message || 'Unknown error';
      if (errorMessage.includes('Failed to load map library')) {
        setMapError('Unable to load map. Please check your internet connection.');
      } else if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
        setMapError('Network error. Please check your connection and try again.');
      } else {
        setMapError('Failed to load map. Please refresh the page.');
      }
      setMapInitializing(false);
    });
    return () => { mounted = false; };
  }, [retryCount]); // Re-run when retryCount changes
  
  // Layer persistence helpers (URL params take priority, localStorage fallback).
  // Unknown keys in the URL are ignored; any layer missing from the URL falls
  // back to localStorage, then to the hard-coded default below.
  const LAYER_KEYS = {
    density: "jet-map-layer-density",
    paths: "jet-map-layer-paths",
    parking: "jet-map-layer-parking",
    stats: "jet-map-layer-stats",
    openNow: "jet-map-layer-open-now",
  } as const;
  type LayerName = keyof typeof LAYER_KEYS;
  const KNOWN_LAYERS = new Set<LayerName>(Object.keys(LAYER_KEYS) as LayerName[]);

  // Filter / time-lapse localStorage keys
  const FILTER_KEYS = {
    timeFilter: "jet-map-time-filter",
    pathTimeFilter: "jet-map-path-time-filter",
    dayFilter: "jet-map-day-filter",
    timelapseMode: "jet-map-timelapse-mode",
    timelapseSpeed: "jet-map-timelapse-speed",
  } as const;
  const VALID_TIME_FILTERS = new Set<'all' | 'today' | 'this_week' | 'this_hour'>(['all', 'today', 'this_week', 'this_hour']);
  const VALID_SPEEDS = new Set<number>([0.5, 1, 2]);

  const getLayerState = (layer: LayerName, fallback: boolean): boolean => {
    try {
      const params = new URLSearchParams(window.location.search);
      const layers = params.get("layers");
      if (layers !== null) {
        const tokens = layers
          .split(",")
          .map((s) => s.trim().toLowerCase())
          .filter((s) => KNOWN_LAYERS.has(s as LayerName)) as LayerName[];
        // URL is authoritative only for layers it mentions; for layers it
        // omits we still fall back to localStorage / defaults below.
        if (tokens.includes(layer)) return true;
      }
    } catch {
      // ignore
    }
    try {
      const raw = localStorage.getItem(LAYER_KEYS[layer]);
      return raw !== null ? raw === "true" : fallback;
    } catch {
      return fallback;
    }
  };

  const getPersistedTimeFilter = (
    key: string,
    fallback: 'all' | 'today' | 'this_week' | 'this_hour',
    urlKey?: string
  ): 'all' | 'today' | 'this_week' | 'this_hour' => {
    try {
      if (urlKey) {
        const params = new URLSearchParams(window.location.search);
        const raw = params.get(urlKey);
        if (raw && VALID_TIME_FILTERS.has(raw as any)) return raw as 'all' | 'today' | 'this_week' | 'this_hour';
      }
    } catch { /* ignore */ }
    try {
      const raw = localStorage.getItem(key);
      if (raw && VALID_TIME_FILTERS.has(raw as any)) return raw as 'all' | 'today' | 'this_week' | 'this_hour';
    } catch { /* ignore */ }
    return fallback;
  };

  const getPersistedDayFilter = (): number | undefined => {
    try {
      const params = new URLSearchParams(window.location.search);
      const raw = params.get('day');
      if (raw !== null) {
        const n = parseInt(raw, 10);
        if (!Number.isNaN(n) && n >= 0 && n <= 6) return n;
      }
    } catch { /* ignore */ }
    try {
      const raw = localStorage.getItem(FILTER_KEYS.dayFilter);
      if (raw === null || raw === "undefined" || raw === "all") return undefined;
      const n = parseInt(raw, 10);
      if (!Number.isNaN(n) && n >= 0 && n <= 6) return n;
    } catch { /* ignore */ }
    return undefined;
  };

  const getPersistedTimelapseMode = (): boolean => {
    try {
      const raw = localStorage.getItem(FILTER_KEYS.timelapseMode);
      return raw === "true";
    } catch { /* ignore */ }
    return false;
  };

  const getPersistedTimelapseSpeed = (): number => {
    try {
      const raw = localStorage.getItem(FILTER_KEYS.timelapseSpeed);
      if (raw) {
        const n = parseFloat(raw);
        if (VALID_SPEEDS.has(n)) return n;
      }
    } catch { /* ignore */ }
    return 1;
  };

  // Density heatmap state
  const [showDensityLayer, setShowDensityLayer] = useState(() => getLayerState("density", false));
  const [showParking, setShowParking] = useState(() => getLayerState("parking", false));
  // Live Stats panel — hidden by default, opt-in via layers toggle
  const [showLiveStats, setShowLiveStats] = useState(() => getLayerState("stats", false));
  // Open-now filter — when on, hides venues whose `isOpen` is explicitly false.
  // Venues with unknown hours (isOpen === null/undefined) remain visible.
  const [openNowOnly, setOpenNowOnly] = useState(() => getLayerState("openNow", false));

  const [timeFilter, setTimeFilter] = useState<'all' | 'today' | 'this_week' | 'this_hour'>(() => getPersistedTimeFilter(FILTER_KEYS.timeFilter, 'all', 'time'));
  const [hourFilter, setHourFilter] = useState<number | undefined>();
  const [dayFilter, setDayFilter] = useState<number | undefined>(() => getPersistedDayFilter());
  // Auto-detect time of day based on local time
  const getTimeOfDayPreset = (): 'dawn' | 'day' | 'dusk' | 'night' => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 8) return 'dawn';
    if (hour >= 8 && hour < 17) return 'day';
    if (hour >= 17 && hour < 20) return 'dusk';
    return 'night';
  };

  // Auto-detect theme for initial map style
  const [mapStyle, setMapStyle] = useState<'light' | 'dark' | 'streets' | 'satellite'>(() => {
    const isDark = document.documentElement.classList.contains('dark');
    return isDark ? 'dark' : 'streets';
  });
  const [lightPreset] = useState<'dawn' | 'day' | 'dusk' | 'night'>(getTimeOfDayPreset);
  const [show3DTerrain, setShow3DTerrain] = useState(false);

  // Time-lapse mode state
  const [timelapseMode, setTimelapseMode] = useState(() => getPersistedTimelapseMode());

  // Movement paths state
  const [showMovementPaths, setShowMovementPaths] = useState(() => getLayerState("paths", false));
  const [pathTimeFilter, setPathTimeFilter] = useState<'all' | 'today' | 'this_week' | 'this_hour'>(() => getPersistedTimeFilter(FILTER_KEYS.pathTimeFilter, 'all', 'pathTime'));

  // Sync active layer toggles and filter selections to URL query params for shareability
  const syncUrlParams = useCallback(() => {
    const params = new URLSearchParams(window.location.search);

    // Layers
    const active: LayerName[] = [];
    if (showDensityLayer) active.push("density");
    if (showMovementPaths) active.push("paths");
    if (showParking) active.push("parking");
    if (showLiveStats) active.push("stats");
    const currentLayers = params.get("layers");
    const nextLayers = active.length > 0 ? active.join(",") : null;
    if (nextLayers !== currentLayers) {
      if (nextLayers) {
        params.set("layers", nextLayers);
      } else {
        params.delete("layers");
      }
    }

    // Filters
    if (timeFilter !== 'all') params.set("time", timeFilter);
    else params.delete("time");

    if (dayFilter !== undefined) params.set("day", String(dayFilter));
    else params.delete("day");

    if (pathTimeFilter !== 'all') params.set("pathTime", pathTimeFilter);
    else params.delete("pathTime");

    const search = params.toString();
    const newUrl = search ? `${window.location.pathname}?${search}` : window.location.pathname;
    window.history.replaceState(null, "", newUrl);
  }, [showDensityLayer, showMovementPaths, showParking, showLiveStats, timeFilter, dayFilter, pathTimeFilter]);

  useEffect(() => {
    syncUrlParams();
  }, [syncUrlParams]);

  // Sync state FROM URL on browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);

      const timeRaw = params.get('time');
      setTimeFilter(timeRaw && VALID_TIME_FILTERS.has(timeRaw as any) ? (timeRaw as any) : 'all');

      const pathTimeRaw = params.get('pathTime');
      setPathTimeFilter(pathTimeRaw && VALID_TIME_FILTERS.has(pathTimeRaw as any) ? (pathTimeRaw as any) : 'all');

      const dayRaw = params.get('day');
      if (dayRaw === null) {
        setDayFilter(undefined);
      } else {
        const n = parseInt(dayRaw, 10);
        setDayFilter(!Number.isNaN(n) && n >= 0 && n <= 6 ? n : undefined);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Persist layer toggles to localStorage as fallback
  useEffect(() => { localStorage.setItem(LAYER_KEYS.density, String(showDensityLayer)); }, [showDensityLayer]);
  useEffect(() => { localStorage.setItem(LAYER_KEYS.paths, String(showMovementPaths)); }, [showMovementPaths]);
  useEffect(() => { localStorage.setItem(LAYER_KEYS.parking, String(showParking)); }, [showParking]);
  useEffect(() => { localStorage.setItem(LAYER_KEYS.stats, String(showLiveStats)); }, [showLiveStats]);
  useEffect(() => { localStorage.setItem(LAYER_KEYS.openNow, String(openNowOnly)); }, [openNowOnly]);

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

  // Persist filter / time-lapse selections to localStorage
  useEffect(() => { localStorage.setItem(FILTER_KEYS.timeFilter, timeFilter); }, [timeFilter]);
  useEffect(() => { localStorage.setItem(FILTER_KEYS.pathTimeFilter, pathTimeFilter); }, [pathTimeFilter]);
  useEffect(() => { localStorage.setItem(FILTER_KEYS.dayFilter, dayFilter === undefined ? "all" : String(dayFilter)); }, [dayFilter]);
  useEffect(() => { localStorage.setItem(FILTER_KEYS.timelapseMode, String(timelapseMode)); }, [timelapseMode]);
  
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
  const [legendCollapsed, setLegendCollapsed] = useState(true);
  
  // User location state
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [detectedCity, setDetectedCity] = useState<City | null>(null); // Nearest predefined city for filtering
  const [detectedLocationName, setDetectedLocationName] = useState<string | null>(null); // Actual city name from reverse geocoding
  // Persisted across sessions so a returning user lands in the same mode
  // (selected city vs. current-location) without a brief flash.
  const [isUsingCurrentLocation, setIsUsingCurrentLocation] = useState<boolean>(() => {
    try {
      const raw = typeof window !== 'undefined'
        ? window.localStorage.getItem('jet-map-use-current-location')
        : null;
      if (raw === 'true') return true;
      if (raw === 'false') return false;
    } catch { /* ignore */ }
    return true; // Default: use current location
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(
        'jet-map-use-current-location',
        String(isUsingCurrentLocation),
      );
    } catch { /* ignore */ }
  }, [isUsingCurrentLocation]);
  // Ref mirror so the (one-time-bound) geolocate event handler always sees the
  // latest value without needing to re-subscribe.
  const isUsingCurrentLocationRef = useRef(true);
  useEffect(() => {
    isUsingCurrentLocationRef.current = isUsingCurrentLocation;
  }, [isUsingCurrentLocation]);
  // Mirror selectedCity + onCityChange so the (one-time) geolocate handler
  // can sync the parent without re-subscribing on every prop change.
  const selectedCityRef = useRef(selectedCity);
  const onCityChangeRef = useRef(onCityChange);
  useEffect(() => { selectedCityRef.current = selectedCity; }, [selectedCity]);
  useEffect(() => { onCityChangeRef.current = onCityChange; }, [onCityChange]);

  // City selector search query
  const [citySearchQuery, setCitySearchQuery] = useState("");
  
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
  }, [detectedLocationName, isUsingCurrentLocation, onDetectedLocationNameChange]);
  
  // Sync map style with theme changes
  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.attributeName === 'class') {
          const isDark = document.documentElement.classList.contains('dark');
          setMapStyle(prev => {
            // Only auto-switch if user hasn't manually picked satellite
            if (prev === 'satellite') return prev;
            return isDark ? 'dark' : 'streets';
          });
        }
      }
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
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
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);
  
  const { densityData, loading: densityLoading, error: densityError, refresh: refreshDensity } = useLocationDensity({
    timeFilter,
    hourOfDay: timelapseMode ? undefined : hourFilter,
    dayOfWeek: dayFilter,
  });

  const { pathData, loading: pathsLoading, error: pathsError, refresh: refreshPaths } = useMovementPaths({
    timeFilter: pathTimeFilter,
    minFrequency: minPathFrequency,
  });

  // Visual loading states for layer toggles so users see a clear refresh
  // whenever a data-backed layer is switched on or off.
  const [isLoadingHeatmap, setIsLoadingHeatmap] = useState(false);
  const [isLoadingPaths, setIsLoadingPaths] = useState(false);
  const [isLoadingStats, setIsLoadingStats] = useState(false);

  // Coalesce rapid toggle-triggered refreshes so consecutive on/off/on taps
  // don't cause a chain of loader flashes or redundant network requests.
  const densityRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pathsRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  const timelapse = useHeatmapTimelapse(dayFilter, initialTimelapseSpeed.current);

  // Persist timelapse playback speed
  useEffect(() => {
    localStorage.setItem(FILTER_KEYS.timelapseSpeed, String(timelapse.speed));
  }, [timelapse.speed]);

  // Reset to defaults — clears localStorage and restores factory settings
  const handleResetToDefaults = useCallback(() => {
    triggerHaptic('medium');

    // Clear persisted layer toggles
    Object.values(LAYER_KEYS).forEach((key) => {
      try { localStorage.removeItem(key); } catch { /* ignore */ }
    });

    // Clear persisted filter / time-lapse settings
    Object.values(FILTER_KEYS).forEach((key) => {
      try { localStorage.removeItem(key); } catch { /* ignore */ }
    });

    // Reset all state to defaults
    setShowDensityLayer(false);
    setShowParking(false);
    setShowLiveStats(false);
    setShowMovementPaths(false);
    setTimeFilter('all');
    setPathTimeFilter('all');
    setDayFilter(undefined);
    setHourFilter(undefined);
    setTimelapseMode(false);
    setMinPathFrequency(2);

    // Reset time-lapse playback
    if (timelapse.isPlaying) timelapse.pause();
    timelapse.setSpeed(1);
    timelapse.setHour(new Date().getHours());

    // Strip layers and filters from URL
    try {
      const params = new URLSearchParams(window.location.search);
      params.delete('layers');
      params.delete('time');
      params.delete('day');
      params.delete('pathTime');
      const search = params.toString();
      const newUrl = search ? `${window.location.pathname}?${search}` : window.location.pathname;
      window.history.replaceState(null, '', newUrl);
    } catch { /* ignore */ }
  }, [timelapse]);

  // Handle map resize on viewport changes - optimized for all mobile devices
  useEffect(() => {
    let resizeTimeout: ReturnType<typeof setTimeout>;
    
    const handleResize = () => {
      // Debounce resize to prevent excessive calls during orientation changes
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        if (map.current) {
          map.current.resize();
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

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    
    // Visual viewport API for iOS Safari dynamic viewport
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleVisualViewportResize);
    }
    
    // Handle visibility changes (e.g., when switching tabs)
    const handleVisibilityChange = () => {
      if (!document.hidden && map.current) {
        setTimeout(() => map.current?.resize(), 100);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Handle page focus for PWA and native apps
    const handleFocus = () => {
      if (map.current) {
        setTimeout(() => map.current?.resize(), 150);
      }
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      clearTimeout(resizeTimeout);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleVisualViewportResize);
      }
    };
  }, []);

  useEffect(() => {
    if (!mapContainer.current || map.current) return;
    
    // Wait for mapbox-gl module to be loaded
    if (!mapboxLoaded || !mapboxglRef.current) return;
    
    // Validate token before initialization
    if (!mapboxToken || mapboxToken.trim() === '') {
      console.error('MapboxHeatmap: Invalid or missing Mapbox token');
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
        console.log('MapboxHeatmap: Initializing map for', selectedCity.name);

        const settings = platformSettings.current;
        
        // Initialize map centered on selected city with platform-specific optimizations
        // Using Mapbox Standard Style for enhanced 3D buildings, dynamic lighting, and performance
        map.current = new mapboxgl.Map({
          container: mapContainer.current,
          style: mapStyle === 'dark' ? 'mapbox://styles/mapbox/dark-v11' 
                 : mapStyle === 'light' ? 'mapbox://styles/mapbox/light-v11'
                 : mapStyle === 'satellite' ? 'mapbox://styles/mapbox/satellite-streets-v12'
                 : 'mapbox://styles/mapbox/streets-v12',
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
          projection: 'globe' as any,
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
          localIdeographFontFamily: "'Noto Sans', 'Noto Sans CJK SC', sans-serif",
          // Reduce font loading by using local font stack for labels
          // This saves loading DIN Pro fonts from Mapbox CDN
          localFontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        });

        // Add attribution control in a better position
        map.current.addControl(
          new mapboxgl.AttributionControl({
            compact: true,
          }),
          'bottom-right'
        );

        // Add atmospheric effects and configure Standard style when loaded
        map.current.on('style.load', () => {
          if (!map.current) return;
          
          // Configure Standard style with dynamic lighting and native POI markers
          // Standard style includes built-in 3D buildings, landmarks, POI icons, and dynamic lighting
          try {
            // Set the light preset for dynamic lighting (dawn, day, dusk, night)
            map.current.setConfigProperty('basemap', 'lightPreset', 'night');
            
            // Enable native POI markers and labels (Standard style feature)
            map.current.setConfigProperty('basemap', 'showPointOfInterestLabels', true);
            map.current.setConfigProperty('basemap', 'showTransitLabels', true);
            map.current.setConfigProperty('basemap', 'showPlaceLabels', true);
            map.current.setConfigProperty('basemap', 'showRoadLabels', true);
            
            // Enable 3D landmark icons for enhanced visual experience
            map.current.setConfigProperty('basemap', 'showLandmarkIcons', true);
            
            // Configure POI density and styling
            map.current.setConfigProperty('basemap', 'theme', 'default');
          } catch (e) {
            // Config properties may not be available in all style versions
            console.log('Standard style config not fully available:', e);
          }
          
          // Dynamic fog based on light preset for atmospheric depth
          const fogConfig = {
            color: 'rgb(10, 10, 15)',
            'high-color': 'rgb(30, 20, 40)',
            'horizon-blend': 0.05,
            'space-color': 'rgb(5, 5, 10)',
            'star-intensity': 0.2,
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
          "top-right"
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
          // Swallow the Mapbox "Geolocation support is not available" warning
          // in iframe/permission-limited environments without breaking the map.
          geolocateControl.on('error', (e: any) => {
            console.warn('MapboxHeatmap: Geolocation control error (non-fatal):', e?.message || e);
          });
        }

        
        // Create custom marker element for user location
        const createUserMarker = () => {
          const el = document.createElement('div');
          el.className = 'user-location-marker';
          el.style.width = '64px';
          el.style.height = '64px';
          el.style.display = 'flex';
          el.style.alignItems = 'center';
          el.style.justifyContent = 'center';
          el.style.position = 'relative';
          // Note: No CSS transition on transform - Mapbox handles marker positioning
          // and transitions would cause visual lag during map pan/zoom
          
          // Glassmorphic puck container - visible frosted glass circle
          const glassPuck = document.createElement('div');
          glassPuck.style.position = 'absolute';
          glassPuck.style.width = '100%';
          glassPuck.style.height = '100%';
          glassPuck.style.borderRadius = '50%';
          glassPuck.style.overflow = 'hidden';
          glassPuck.style.background = 'linear-gradient(135deg, rgba(255, 255, 255, 0.15) 0%, rgba(255, 255, 255, 0.05) 100%)';
          glassPuck.style.backdropFilter = 'blur(12px) saturate(180%)';
          (glassPuck.style as any).WebkitBackdropFilter = 'blur(12px) saturate(180%)';
          glassPuck.style.border = '1px solid rgba(255, 255, 255, 0.2)';
          glassPuck.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2), 0 0 20px rgba(255, 69, 58, 0.3)';
          glassPuck.style.display = 'flex';
          glassPuck.style.alignItems = 'center';
          glassPuck.style.justifyContent = 'center';
          
          const img = document.createElement('img');
          img.src = locationPuckIcon;
          img.width = 32;
          img.height = 32;
          img.style.width = '70%';
          img.style.height = '70%';
          img.style.objectFit = 'contain';
          img.style.filter = 'drop-shadow(0 2px 8px rgba(0, 0, 0, 0.5))';
          
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
        const animateMarkerTo = (targetLng: number, targetLat: number, duration: number = 300) => {
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
        geolocateControl?.on('geolocate', async (e: any) => {
          const { longitude, latitude } = e.coords;
          
          // Update user location state
          setUserLocation({ lat: latitude, lng: longitude });
          
          // Find the nearest predefined city using proper Haversine distance (for filtering)
          const nearestCity = getNearestCity(latitude, longitude);
          
          // Store last known location for tile prefetching on next visit
          storeLastKnownLocation(latitude, longitude, nearestCity.name);
          
          // Set detected city based on location (used for data filtering)
          setDetectedCity(nearestCity);
          
          // Perform reverse geocoding to get actual city/metro name
          getCachedReverseGeocode(latitude, longitude, mapboxToken).then((geocoded) => {
            if (geocoded) {
              setDetectedLocationName(geocoded.fullName);
            } else {
              // Fall back to nearest predefined city name
              setDetectedLocationName(`${nearestCity.name}, ${nearestCity.state}`);
            }
          });
          
          // Notify parent of detected city on initial geolocate (auto-select nearest city)
          if (isInitialGeolocate && onNearestCityDetected) {
            onNearestCityDetected(nearestCity);
          }

          // If the user is in "Use Current Location" mode, keep the parent's
          // selectedCity in sync with the nearest detected city so data filters
          // (deals, density, paths) match where the user actually is.
          if (
            isUsingCurrentLocationRef.current &&
            nearestCity.id !== selectedCityRef.current.id
          ) {
            onCityChangeRef.current(nearestCity);
          }
          
          // Only fly to user location on initial load (default behavior)
          // After that, users can pan/zoom freely without being pulled back
          if (isInitialGeolocate && map.current) {
            map.current.flyTo({
              center: [longitude, latitude],
              zoom: Math.max(map.current.getZoom(), 13),
              duration: 1500,
              essential: true
            });
            isInitialGeolocate = false;
          }
          
          // Create or update user marker with smooth interpolation
          if (!userMarker.current && map.current && mapboxglRef.current) {
            userMarker.current = new mapboxglRef.current.Marker({
              element: createUserMarker(),
              anchor: 'bottom'
            })
              .setLngLat([longitude, latitude])
              .addTo(map.current);
            currentMarkerPos = { lng: longitude, lat: latitude };
          } else if (userMarker.current) {
            // Smoothly animate to new position
            animateMarkerTo(longitude, latitude, 400);
          }
        });
        
        // Remove marker when tracking stops
        geolocateControl?.on('trackuserlocationend', () => {
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
            setLoadingStage('ready');
          }
        };

        // Ensure map resizes to container after initialization
        map.current.on('load', () => {
          const loadTime = performance.now() - initStartTime.current;
          console.log(`MapboxHeatmap: Map loaded successfully in ${loadTime.toFixed(2)}ms`);
          
          // Finalize immediately for fastest LCP
          finalizeMapLoad();

          // Close any open venue chip on off-map taps (background click).
          // Marker clicks call stopPropagation, so this only fires for empty map taps.
          map.current?.on('click', () => {
            activeChipRef.current?.hide();
          });
          
          // Add parking lot icons from Mapbox vector tiles
          if (map.current) {
            try {
              // Create a bold green "P" icon for parking
              if (!map.current.hasImage('jet-parking-p')) {
                const size = 64;
                const canvas = document.createElement('canvas');
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                  // Neon green glow background
                  ctx.beginPath();
                  ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
                  ctx.fillStyle = '#39ff14'; // neon green
                  ctx.fill();
                  // Dark inner circle for contrast
                  ctx.beginPath();
                  ctx.arc(size / 2, size / 2, size / 2 - 6, 0, Math.PI * 2);
                  ctx.fillStyle = '#0a0a0a';
                  ctx.fill();
                  // Bold neon P
                  ctx.fillStyle = '#39ff14';
                  ctx.font = 'bold 48px system-ui, -apple-system, Arial, sans-serif';
                  ctx.textAlign = 'center';
                  ctx.textBaseline = 'middle';
                  ctx.fillText('P', size / 2, size / 2 + 2);
                  map.current.addImage('jet-parking-p', {
                    width: size,
                    height: size,
                    data: ctx.getImageData(0, 0, size, size).data,
                  } as any, { pixelRatio: 2 });
                }
              }

              // Add a symbol layer for parking POIs using built-in Mapbox data
              map.current.addLayer({
                id: 'parking-icons',
                type: 'symbol',
                source: 'composite',
                'source-layer': 'poi_label',
                filter: [
                  'any',
                  ['==', ['get', 'maki'], 'parking'],
                  ['==', ['get', 'maki'], 'parking-garage'],
                ],
                layout: {
                  'icon-image': 'jet-parking-p',
                  'icon-size': [
                    'interpolate', ['linear'], ['zoom'],
                    12, 0.45,
                    14, 0.6,
                    16, 0.9,
                    18, 1.3,
                  ],
                  'icon-allow-overlap': true,
                  'icon-ignore-placement': false,
                  'text-field': ['step', ['zoom'], '', 14, ['get', 'name']],
                  'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
                  'text-size': 11,
                  'text-offset': [0, 1.3],
                  'text-anchor': 'top',
                  'text-optional': true,
                  'visibility': showParking ? 'visible' : 'none',
                },
                paint: {
                  'icon-opacity': [
                    'interpolate', ['linear'], ['zoom'],
                    12, 0.7,
                    13, 0.85,
                    14, 1,
                  ],
                  'text-color': '#39ff14',
                  'text-halo-color': '#0a0a0a',
                  'text-halo-width': 2,
                },
                minzoom: 12,
              });
              console.log('MapboxHeatmap: Parking icons layer added');

              // Add click handler for parking icons
              map.current.on('click', 'parking-icons', (e) => {
                if (!e.features || e.features.length === 0) return;
                const feature = e.features[0];
                const coords = (feature.geometry as any).coordinates;
                const parkingName = feature.properties?.name || 'Parking';
                
                triggerHaptic('medium');
                onParkingSelectRef.current?.({
                  lat: coords[1],
                  lng: coords[0],
                  name: parkingName,
                });
              });

              // Change cursor on hover
              map.current.on('mouseenter', 'parking-icons', () => {
                if (map.current) map.current.getCanvas().style.cursor = 'pointer';
              });
              map.current.on('mouseleave', 'parking-icons', () => {
                if (map.current) map.current.getCanvas().style.cursor = '';
              });
            } catch (e) {
              console.warn('MapboxHeatmap: Could not add parking layer:', e);
            }
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
        map.current.once('style.load', () => {
          console.log('MapboxHeatmap: Style loaded');
          // Finalize quickly if main load hasn't fired yet
          setTimeout(() => {
            if (mapInitializing && map.current) {
              console.log('MapboxHeatmap: Finalizing via style.load fallback');
              finalizeMapLoad();
            }
          }, 100);
        });
        
        // Fallback: idle event fires when map is completely ready
        map.current.once('idle', () => {
          if (mapInitializing && map.current) {
            console.log('MapboxHeatmap: Finalizing via idle fallback');
            finalizeMapLoad();
          }
        });

        // Track tile loading (stage indicator only)
        map.current.on('dataloading', () => {
          setLoadingStage(prev => prev === 'init' ? 'style' : prev);
        });

        // Add error handler with retry tracking
        let errorCount = 0;
        const maxErrors = 5;

        map.current.on('error', (e) => {
          const err: any = (e as any)?.error;
          const status = err?.status ?? err?.statusCode;
          const url = err?.url ?? err?.resource ?? err?.request?.url;

          console.error('MapboxHeatmap: Map error', err);

          // If the Mapbox token is URL-restricted, production domains often get 401/403 for api.mapbox.com
          if ((status === 401 || status === 403) && typeof url === 'string' && url.includes('api.mapbox.com')) {
            setMapError(
              'Mapbox token is not authorized for this domain. Update your Mapbox token URL restrictions to include this site.'
            );
            setMapInitializing(false);
            return;
          }

          errorCount++;

          // If too many errors occur during loading, show error state
          if (errorCount >= maxErrors && !mapLoaded) {
            setMapError('Failed to load map tiles. Please check your connection.');
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
                (typeof (map.current as any).isStyleLoaded === 'function' && map.current.isStyleLoaded());

              if (isActuallyLoaded) {
                console.log('MapboxHeatmap: Map was actually loaded, finalizing');
                finalizeMapLoad();
              } else {
                console.warn('MapboxHeatmap: Map load timeout - silently retrying');
                // Check for WebGL support - only show error for hard failures
                const canvas = document.createElement('canvas');
                const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
                if (!gl) {
                  setMapError('WebGL is not supported or disabled. Please enable it in your browser settings.');
                  setMapInitializing(false);
                } else {
                  // Silent retry instead of showing error overlay
                  console.log('MapboxHeatmap: Auto-retrying map load...');
                  setMapInitializing(false);
                  setTimeout(() => {
                    setMapError(null);
                    setMapInitializing(true);
                    setLoadingStage('module');
                    mapboxLoadPromise = null;
                    setRetryCount(c => c + 1);
                  }, 1000);
                }
              }
            } else {
              setMapError('Map failed to initialize. Please refresh and try again.');
              setMapInitializing(false);
            }
          }
        }, 15000);
        
        map.current.once('load', () => {
          clearTimeout(loadTimeout);
        });
        
      } catch (error) {
        console.error('MapboxHeatmap: Failed to initialize map', error);
        setMapError('Failed to initialize map. Please try again.');
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
      const ric: any = (window as any).requestIdleCallback;
      if (typeof ric === 'function') {
        idleHandle = ric(() => { if (!cancelled) initializeMap(); }, { timeout: 800 });
      } else {
        timeoutHandle = setTimeout(() => { if (!cancelled) initializeMap(); }, 120);
      }
    };
    rafHandle1 = requestAnimationFrame(() => {
      rafHandle2 = requestAnimationFrame(scheduleInit);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafHandle1);
      cancelAnimationFrame(rafHandle2);
      if (idleHandle != null && (window as any).cancelIdleCallback) {
        (window as any).cancelIdleCallback(idleHandle);
      }
      if (timeoutHandle) clearTimeout(timeoutHandle);
      cleanupMap();
    };
    
    function cleanupMap() {
      setMapLoaded(false);
      setMapError(null);
      if (userMarker.current) {
        userMarker.current.remove();
      }
      markersRef.current.forEach((marker) => marker.remove());
      dealMarkersRef.current.forEach((marker) => marker.remove());
      map.current?.remove();
      map.current = null;
    }

    return () => {
      cleanupMap();
    };
  }, [mapboxToken, mapboxLoaded, retryCount]);
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    
    map.current.flyTo({
      center: [selectedCity.lng, selectedCity.lat],
      zoom: selectedCity.zoom,
      duration: 2000,
      essential: true
    });
  }, [selectedCity, mapLoaded]);

  // Handle map style changes
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    
    const styleUrls: Record<string, string> = {
      'light': 'mapbox://styles/mapbox/light-v11',
      'dark': 'mapbox://styles/mapbox/dark-v11',
      'streets': 'mapbox://styles/mapbox/streets-v12',
      'satellite': 'mapbox://styles/mapbox/satellite-streets-v12'
    };
    
    map.current.setStyle(styleUrls[mapStyle]);
  }, [mapStyle, mapLoaded]);

  // Handle dynamic lighting preset changes with smooth animated transitions
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    
    const mapInstance = map.current;
    
    // Fog configurations for each light preset
    const fogConfigs: Record<string, { color: string; highColor: string; horizonBlend: number; spaceColor: string; starIntensity: number }> = {
      dawn: {
        color: 'rgb(255, 200, 150)',
        highColor: 'rgb(200, 150, 120)',
        horizonBlend: 0.08,
        spaceColor: 'rgb(50, 30, 40)',
        starIntensity: 0.05,
      },
      day: {
        color: 'rgb(220, 230, 240)',
        highColor: 'rgb(180, 200, 230)',
        horizonBlend: 0.1,
        spaceColor: 'rgb(100, 150, 200)',
        starIntensity: 0,
      },
      dusk: {
        color: 'rgb(180, 100, 80)',
        highColor: 'rgb(120, 80, 100)',
        horizonBlend: 0.08,
        spaceColor: 'rgb(30, 20, 40)',
        starIntensity: 0.1,
      },
      night: {
        color: 'rgb(10, 10, 15)',
        highColor: 'rgb(30, 20, 40)',
        horizonBlend: 0.05,
        spaceColor: 'rgb(5, 5, 10)',
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
    const lerpRgb = (from: [number, number, number], to: [number, number, number], t: number): string => {
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
      mapInstance.setConfigProperty('basemap', 'lightPreset', lightPreset);
      
      // Get current fog state (approximate from previous preset or default to night)
      const targetConfig = fogConfigs[lightPreset];
      
      // Animate fog transition over 1.5 seconds
      const duration = 1500;
      const startTime = performance.now();
      let animationFrame: number;
      
      // Get starting values (we'll interpolate from current state)
      const currentFog = mapInstance.getFog();
      const startColor = currentFog?.color ? parseRgb(currentFog.color as string) : parseRgb(fogConfigs.night.color);
      const startHighColor = currentFog?.['high-color'] ? parseRgb(currentFog['high-color'] as string) : parseRgb(fogConfigs.night.highColor);
      const startSpaceColor = currentFog?.['space-color'] ? parseRgb(currentFog['space-color'] as string) : parseRgb(fogConfigs.night.spaceColor);
      const startHorizonBlend = (currentFog?.['horizon-blend'] as number) ?? fogConfigs.night.horizonBlend;
      const startStarIntensity = (currentFog?.['star-intensity'] as number) ?? fogConfigs.night.starIntensity;
      
      const targetColor = parseRgb(targetConfig.color);
      const targetHighColor = parseRgb(targetConfig.highColor);
      const targetSpaceColor = parseRgb(targetConfig.spaceColor);
      
      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const rawProgress = Math.min(elapsed / duration, 1);
        const progress = easeInOutCubic(rawProgress);
        
        const interpolatedFog = {
          color: lerpRgb(startColor, targetColor, progress),
          'high-color': lerpRgb(startHighColor, targetHighColor, progress),
          'horizon-blend': lerp(startHorizonBlend, targetConfig.horizonBlend, progress),
          'space-color': lerpRgb(startSpaceColor, targetSpaceColor, progress),
          'star-intensity': lerp(startStarIntensity, targetConfig.starIntensity, progress),
        };
        
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
      console.log('Light preset configuration not available:', e);
    }
  }, [lightPreset, mapLoaded]);

  // Handle 3D terrain toggle
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    if (show3DTerrain) {
      // Enable 3D terrain with exaggeration
      map.current.setTerrain({ 
        source: 'mapbox-dem', 
        exaggeration: 1.5 
      });
      
      // Animate to a better viewing angle for terrain
      map.current.easeTo({
        pitch: 60,
        duration: 1000
      });
    } else {
      // Disable terrain
      map.current.setTerrain(null);
      
      // Return to normal viewing angle
      map.current.easeTo({
        pitch: isMobile ? 30 : 50,
        duration: 1000
      });
    }
  }, [show3DTerrain, mapLoaded, isMobile]);

  // Add/update density heatmap layer with lazy loading (supports timelapse mode)
  useEffect(() => {
    // Use timelapse data when in timelapse mode, otherwise use regular density data
    const activeData = timelapseMode && timelapse.currentData 
      ? timelapse.currentData 
      : densityData;
      
    if (!map.current || !mapLoaded || !activeData) return;

    const sourceId = 'location-density';
    const layerId = 'location-density-heat';
    const pointLayerId = `${layerId}-point`;
    const glowLayerId = `${layerId}-glow`;

    try {
      // Remove existing layers and source if they exist - check style is loaded first
      if (map.current?.style?.loaded()) {
        [glowLayerId, pointLayerId, layerId].forEach(id => {
          if (map.current?.getLayer(id)) {
            map.current.removeLayer(id);
          }
        });
        if (map.current?.getSource(sourceId)) {
          map.current.removeSource(sourceId);
        }
      }
    } catch (error) {
      console.error('Error removing existing layers:', error);
      return;
    }

    if (!showDensityLayer) return;

    // Add density data source
    map.current.addSource(sourceId, {
      type: 'geojson',
      data: activeData.geojson,
    });

    // Add enhanced heatmap layer with glow effect.
    // Mobile viewports get larger radii, slightly lower peak opacity, and a
    // gentler intensity curve so the heat stays readable on small screens
    // (and doesn't blow out into solid red when users pinch-zoom).
    map.current.addLayer({
      id: layerId,
      type: 'heatmap',
      source: sourceId,
      paint: {
        // Enhanced weight calculation with exponential curve
        'heatmap-weight': [
          'interpolate',
          ['exponential', 1.5],
          ['get', 'density'],
          0, 0,
          5, 0.5,
          10, 1,
        ],
        // Dynamic intensity based on zoom with higher peak
        'heatmap-intensity': [
          'interpolate',
          ['exponential', 2],
          ['zoom'],
          0, isMobile ? 2.2 : 2,
          9, isMobile ? 2.6 : 3,
          15, isMobile ? 4 : 5,
        ],
        // Enhanced vibrant color ramp with smooth gradients
        'heatmap-color': [
          'interpolate',
          ['linear'],
          ['heatmap-density'],
          0, 'rgba(0, 0, 0, 0)',              // transparent
          0.1, 'rgba(65, 105, 225, 0.6)',     // royal blue with glow
          0.2, 'rgba(0, 191, 255, 0.8)',      // deep sky blue
          0.3, 'rgba(0, 255, 127, 0.85)',     // spring green
          0.4, 'rgba(50, 205, 50, 0.9)',      // lime green
          0.5, 'rgba(255, 255, 0, 0.95)',     // yellow
          0.6, 'rgba(255, 215, 0, 0.95)',     // gold
          0.7, 'rgba(255, 165, 0, 1)',        // orange
          0.8, 'rgba(255, 69, 0, 1)',         // orange-red
          0.9, 'rgba(255, 0, 0, 1)',          // red
          1, 'rgba(139, 0, 0, 1)',            // dark red
        ],
        // Adaptive radius — smooth cubic-bezier easing across the full zoom
        // range with intermediate stops so blobs grow/shrink fluidly during
        // pinch-zoom instead of stepping between sparse interpolation points.
        'heatmap-radius': [
          'interpolate',
          ['cubic-bezier', 0.4, 0, 0.2, 1],
          ['zoom'],
          0,  isMobile ? 26 : 20,
          5,  isMobile ? 38 : 30,
          9,  isMobile ? 60 : 50,
          11, isMobile ? 72 : 60,
          12, isMobile ? 82 : 70,
          13, isMobile ? 94 : 80,
          15, isMobile ? 115 : 100,
          17, isMobile ? 130 : 115,
        ],
        // Opacity eased with cubic-bezier and extra anchor stops so the layer
        // never abruptly washes out as the user zooms in or out.
        'heatmap-opacity': [
          'interpolate',
          ['cubic-bezier', 0.4, 0, 0.2, 1],
          ['zoom'],
          5,  isMobile ? 0.85 : 1,
          7,  isMobile ? 0.82 : 0.95,
          10, isMobile ? 0.8  : 0.92,
          12, isMobile ? 0.78 : 0.9,
          14, isMobile ? 0.74 : 0.87,
          15, isMobile ? 0.7  : 0.85,
          17, isMobile ? 0.6  : 0.75,
        ],
        // Paint-property transitions: smoothly tween between values when the
        // layer is re-evaluated (city switch, time-lapse hour change, mobile
        // class flip). Pair with a matching radius transition for parity.
        'heatmap-radius-transition': { duration: 450, delay: 0 },
        'heatmap-opacity-transition': { duration: 600, delay: 0 },
      },
    });

    // Add enhanced circle layer for detailed view with pulsing animation
    map.current.addLayer({
      id: `${layerId}-point`,
      type: 'circle',
      source: sourceId,
      minzoom: 13,
      paint: {
        // Dynamic radius based on density with exponential scaling
        'circle-radius': [
          'interpolate',
          ['exponential', 1.5],
          ['get', 'density'],
          0, 5,
          5, 12,
          10, 25,
        ],
        // Vibrant color gradient matching heatmap
        'circle-color': [
          'interpolate',
          ['linear'],
          ['get', 'density'],
          0, 'rgb(65, 105, 225)',
          3, 'rgb(0, 255, 127)',
          6, 'rgb(255, 215, 0)',
          8, 'rgb(255, 69, 0)',
          10, 'rgb(139, 0, 0)',
        ],
        'circle-opacity': 0.7,
        'circle-blur': 0.3,
        'circle-stroke-width': 2,
        'circle-stroke-color': [
          'interpolate',
          ['linear'],
          ['get', 'density'],
          0, 'rgba(255, 255, 255, 0.6)',
          10, 'rgba(255, 255, 255, 0.9)',
        ],
        'circle-stroke-opacity': 0.8,
        'circle-opacity-transition': {
          duration: 1000,
          delay: 100
        }
      },
    });

    // Add outer glow layer for enhanced visual effect
    map.current.addLayer({
      id: `${layerId}-glow`,
      type: 'circle',
      source: sourceId,
      minzoom: 13,
      paint: {
        'circle-radius': [
          'interpolate',
          ['exponential', 1.5],
          ['get', 'density'],
          0, 10,
          5, 20,
          10, 40,
        ],
        'circle-color': [
          'interpolate',
          ['linear'],
          ['get', 'density'],
          0, 'rgba(65, 105, 225, 0.3)',
          5, 'rgba(255, 215, 0, 0.4)',
          10, 'rgba(255, 0, 0, 0.5)',
        ],
        'circle-opacity': 0.3,
        'circle-blur': 1,
        'circle-opacity-transition': {
          duration: 1000,
          delay: 200
        }
      },
    });

    console.log('Density heatmap layer added with', activeData.stats.grid_cells, 'points', timelapseMode ? `(hour ${timelapse.currentHour})` : '');
  }, [mapLoaded, densityData, showDensityLayer, timelapseMode, timelapse.currentData, timelapse.currentHour, isMobile]);

  // Add/update movement paths layer with animated flow
  useEffect(() => {
    // Cancel any existing animation
    if (flowAnimationRef.current) {
      cancelAnimationFrame(flowAnimationRef.current);
      flowAnimationRef.current = null;
    }

    if (!map.current || !mapLoaded || !pathData) return;

    const sourceId = 'movement-paths';
    const lineLayerId = 'movement-paths-line';
    const glowLayerId = 'movement-paths-glow';
    const arrowLayerId = 'movement-paths-arrows';
    const particleLayerId = 'movement-paths-particles';

    try {
      // Always attempt to remove existing layers/sources before re-adding to
      // avoid "There is already a source with ID" errors when the style
      // reports not-yet-loaded but the source was previously registered.
      [particleLayerId, arrowLayerId, glowLayerId, lineLayerId].forEach(id => {
        try {
          if (map.current?.getLayer(id)) {
            map.current.removeLayer(id);
          }
        } catch (_) { /* no-op */ }
      });
      try {
        if (map.current?.getSource(sourceId)) {
          map.current.removeSource(sourceId);
        }
      } catch (_) { /* no-op */ }
      try {
        if (map.current?.getSource(`${sourceId}-particles`)) {
          map.current.removeSource(`${sourceId}-particles`);
        }
      } catch (_) { /* no-op */ }
    } catch (error) {
      console.error('Error removing existing movement path layers:', error);
      return;
    }

    if (!showMovementPaths) return;

    // Defensive: if source still somehow exists, update its data instead of re-adding
    const existing = map.current.getSource(sourceId) as any;
    if (existing) {
      try { existing.setData(pathData.geojson); } catch (_) { /* no-op */ }
    } else {
      map.current.addSource(sourceId, {
        type: 'geojson',
        data: pathData.geojson,
        lineMetrics: true,
      });
    }

    // Add glow effect layer (behind main line)
    map.current.addLayer({
      id: glowLayerId,
      type: 'line',
      source: sourceId,
      layout: {
        'line-join': 'round',
        'line-cap': 'round',
      },
      paint: {
        'line-width': [
          'interpolate',
          ['exponential', 1.5],
          ['get', 'frequency'],
          1, 8,
          5, 14,
          10, 22,
          20, 30,
        ],
        'line-color': [
          'interpolate',
          ['linear'],
          ['get', 'frequency'],
          1, 'rgba(100, 200, 255, 0.3)',
          5, 'rgba(0, 255, 255, 0.35)',
          10, 'rgba(255, 200, 0, 0.4)',
          15, 'rgba(255, 100, 0, 0.45)',
          20, 'rgba(255, 0, 100, 0.5)',
        ],
        'line-blur': 4,
        'line-opacity': 0.6,
      },
    });

    // Add main animated flow line layer
    map.current.addLayer({
      id: lineLayerId,
      type: 'line',
      source: sourceId,
      layout: {
        'line-join': 'round',
        'line-cap': 'round',
      },
      paint: {
        'line-width': [
          'interpolate',
          ['exponential', 1.5],
          ['get', 'frequency'],
          1, 3,
          5, 6,
          10, 10,
          20, 14,
        ],
        'line-color': [
          'interpolate',
          ['linear'],
          ['get', 'frequency'],
          1, 'rgb(100, 200, 255)',
          5, 'rgb(0, 255, 255)',
          10, 'rgb(255, 200, 0)',
          15, 'rgb(255, 100, 0)',
          20, 'rgb(255, 0, 100)',
        ],
        'line-opacity': 0.9,
        'line-dasharray': [0, 4, 3],
      },
    });

    // Add arrow icon if not exists
    if (!map.current.hasImage('flow-arrow')) {
      const size = 48;
      const arrowCanvas = document.createElement('canvas');
      arrowCanvas.width = size;
      arrowCanvas.height = size;
      const ctx = arrowCanvas.getContext('2d')!;

      // Create gradient for arrow
      const gradient = ctx.createLinearGradient(0, 0, size, 0);
      gradient.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
      gradient.addColorStop(0.5, 'rgba(255, 255, 255, 1)');
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0.4)');

      // Draw arrow/chevron shape
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(size * 0.2, size * 0.3);
      ctx.lineTo(size * 0.6, size * 0.5);
      ctx.lineTo(size * 0.2, size * 0.7);
      ctx.lineTo(size * 0.35, size * 0.5);
      ctx.closePath();
      ctx.fill();

      // Add outer glow
      ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
      ctx.shadowBlur = 8;
      ctx.fill();

      map.current.addImage('flow-arrow', {
        width: size,
        height: size,
        data: ctx.getImageData(0, 0, size, size).data as any,
      });
    }

    // Add animated arrow symbols for direction
    map.current.addLayer({
      id: arrowLayerId,
      type: 'symbol',
      source: sourceId,
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': 40,
        'icon-image': 'flow-arrow',
        'icon-size': [
          'interpolate',
          ['linear'],
          ['get', 'frequency'],
          1, 0.6,
          10, 0.9,
          20, 1.2,
        ],
        'icon-rotate': 90,
        'icon-rotation-alignment': 'map',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
      paint: {
        'icon-opacity': 0.85,
      },
    });

    // Create animated particle points along paths
    const createParticleData = (offset: number) => {
      const particles: GeoJSON.Feature<GeoJSON.Point>[] = [];
      
      pathData.geojson.features.forEach((feature: any) => {
        if (feature.geometry.type === 'LineString') {
          const coords = feature.geometry.coordinates;
          const frequency = feature.properties?.frequency || 1;
          
          // Create multiple particles per path based on frequency
          const numParticles = Math.min(Math.ceil(frequency / 3), 5);
          
          for (let p = 0; p < numParticles; p++) {
            // Calculate position along the line with offset
            const t = ((offset / 100) + (p / numParticles)) % 1;
            
            if (coords.length >= 2) {
              const segmentCount = coords.length - 1;
              const segmentIndex = Math.floor(t * segmentCount);
              const segmentT = (t * segmentCount) - segmentIndex;
              
              const start = coords[Math.min(segmentIndex, coords.length - 2)];
              const end = coords[Math.min(segmentIndex + 1, coords.length - 1)];
              
              const lng = start[0] + (end[0] - start[0]) * segmentT;
              const lat = start[1] + (end[1] - start[1]) * segmentT;
              
              particles.push({
                type: 'Feature',
                geometry: {
                  type: 'Point',
                  coordinates: [lng, lat],
                },
                properties: {
                  frequency,
                  particleIndex: p,
                },
              });
            }
          }
        }
      });
      
      return {
        type: 'FeatureCollection' as const,
        features: particles,
      };
    };

    // Add particle source
    map.current.addSource(`${sourceId}-particles`, {
      type: 'geojson',
      data: createParticleData(0),
    });

    // Add particle layer
    map.current.addLayer({
      id: particleLayerId,
      type: 'circle',
      source: `${sourceId}-particles`,
      paint: {
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['get', 'frequency'],
          1, 4,
          10, 7,
          20, 10,
        ],
        'circle-color': [
          'interpolate',
          ['linear'],
          ['get', 'frequency'],
          1, 'rgb(150, 220, 255)',
          5, 'rgb(100, 255, 255)',
          10, 'rgb(255, 230, 100)',
          15, 'rgb(255, 150, 50)',
          20, 'rgb(255, 80, 150)',
        ],
        'circle-opacity': 0.9,
        'circle-blur': 0.3,
        'circle-stroke-width': 2,
        'circle-stroke-color': 'rgba(255, 255, 255, 0.8)',
      },
    });

    // Animate the dash array and particles for continuous flow effect
    const dashArraySequence = [
      [0, 4, 3],
      [0.5, 4, 2.5],
      [1, 4, 2],
      [1.5, 4, 1.5],
      [2, 4, 1],
      [2.5, 4, 0.5],
      [3, 4, 0],
      [0, 0.5, 3, 3.5],
      [0, 1, 3, 3],
      [0, 1.5, 3, 2.5],
      [0, 2, 3, 2],
      [0, 2.5, 3, 1.5],
      [0, 3, 3, 1],
      [0, 3.5, 3, 0.5],
    ];

    let step = 0;
    let particleOffset = 0;
    let lastTime = performance.now();

    const animateFlow = (currentTime: number) => {
      // Stop animation if not visible, low power mode, or paths disabled
      if (!map.current || !showMovementPaths || document.hidden || platformSettings.current.hasReducedMotion || platformSettings.current.isLowPowerMode) {
        flowAnimationRef.current = null;
        return;
      }

      const deltaTime = currentTime - lastTime;
      
      // Update dash animation every ~80ms
      if (deltaTime > 80) {
        step = (step + 1) % dashArraySequence.length;
        
        if (map.current.getLayer(lineLayerId)) {
          map.current.setPaintProperty(
            lineLayerId,
            'line-dasharray',
            dashArraySequence[step]
          );
        }

        // Update particle positions
        particleOffset = (particleOffset + 2) % 100;
        const particleSource = map.current.getSource(`${sourceId}-particles`) as mapboxgl.GeoJSONSource;
        if (particleSource) {
          particleSource.setData(createParticleData(particleOffset));
        }

        lastTime = currentTime;
      }

      flowAnimationRef.current = requestAnimationFrame(animateFlow);
    };

    flowAnimationRef.current = requestAnimationFrame(animateFlow);

    console.log('Movement paths layer added with', pathData.stats.total_paths, 'paths and animated particles');

    // Cleanup animation on unmount
    return () => {
      if (flowAnimationRef.current) {
        cancelAnimationFrame(flowAnimationRef.current);
        flowAnimationRef.current = null;
      }
    };
  }, [mapLoaded, pathData, showMovementPaths]);


  // Skeleton markers removed - direct rendering architecture
  // Venues render immediately when available, no loading placeholders

  // Optimized marker updates with throttling
  const updateMarkers = () => {
    if (!map.current || !mapLoaded) return;

    const mapInstance = map.current;

    // Category → Lucide SVG path map (24x24 viewBox)
    const getCategoryIcon = (category: string): string => {
      const c = (category || '').toLowerCase();
      // Lucide path d-strings
      if (/(bar|cocktail|lounge|pub|brew|beer|wine|spirits)/.test(c))
        // wine / martini-ish (martini glass)
        return '<path d="M8 22h8"/><path d="M12 11v11"/><path d="M19 3H5l7 8z"/>';
      if (/(coffee|cafe|tea|bakery|dessert)/.test(c))
        return '<path d="M17 8h1a4 4 0 0 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z"/><line x1="6" y1="2" x2="6" y2="4"/><line x1="10" y1="2" x2="10" y2="4"/><line x1="14" y1="2" x2="14" y2="4"/>';
      if (/(music|concert|live|venue|night|club|dj)/.test(c))
        return '<circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/><path d="M9 18V5l12-2v13"/>';
      if (/(event|festival|theater|theatre|show|comedy)/.test(c))
        return '<path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/>';
      if (/(gym|fitness|yoga|sport|run|spa)/.test(c))
        return '<path d="M6.5 6.5 17.5 17.5"/><path d="m21 21-1-1"/><path d="m3 3 1 1"/><path d="m18 22 4-4"/><path d="m2 6 4-4"/><path d="m3 10 7-7"/><path d="m14 21 7-7"/>';
      if (/(shop|retail|store|market|boutique)/.test(c))
        return '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>';
      if (/(hotel|stay|lodging|resort)/.test(c))
        return '<path d="M2 22V8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v14"/><path d="M2 18h20"/><circle cx="8" cy="12" r="2"/>';
      // default: utensils (food / restaurant)
      return '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>';
    };
    
    // Use requestAnimationFrame for smoother updates
    requestAnimationFrame(() => {
      // Clear existing markers
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];

      // Get current zoom level for dynamic sizing
      const currentZoom = mapInstance.getZoom();
    
    // Improved zoom scaling formula - larger markers for better visibility
    let zoomFactor: number;
    if (currentZoom < 8) {
      // Very zoomed out - moderate size
      zoomFactor = Math.max(0.5, currentZoom / 16);
    } else if (currentZoom < 12) {
      // Medium zoom - good visibility
      zoomFactor = 0.6 + ((currentZoom - 8) / 4) * 0.4; // 0.6 to 1.0
    } else {
      // Zoomed in - larger markers
      zoomFactor = 1.0 + Math.min(0.4, (currentZoom - 12) / 10); // 1.0 to 1.4
    }
    
    // Increased base size for better visibility on dark map
    const baseSize = 42 * zoomFactor;

    // Direct rendering - no skeleton markers (removed per direct-rendering architecture)

    // Calculate distances between venues to detect clusters
    const getDistance = (lat1: number, lng1: number, lat2: number, lng2: number) => {
      return Math.sqrt(Math.pow(lat2 - lat1, 2) + Math.pow(lng2 - lng1, 2));
    };

    // Apply Open-Now filter: hide venues whose hours indicate they're closed.
    // Venues with unknown hours stay visible so the user never loses places.
    const visibleVenues = openNowOnly
      ? venues.filter((v) => venueOpenStatus.get(v.id) !== false) // keep `true` and `null`
      : venues;

    // Add venue markers
    visibleVenues.forEach((venue, index) => {
      // Guard against map becoming null during iteration
      if (!mapInstance) return;
      
      const color = getActivityColor(venue.activity);
      const isSelected = !!selectedVenue && selectedVenue.id === venue.id;
      const hasSelection = !!selectedVenue;
      const isHighActivity = venue.activity >= 80;
      const GOLD = '#C9A961';

      // Check proximity to other venues
      let nearbyCount = 0;
      visibleVenues.forEach((otherVenue, otherIndex) => {
        if (index !== otherIndex) {
          const distance = getDistance(venue.lat, venue.lng, otherVenue.lat, otherVenue.lng);
          if (distance < 0.001) nearbyCount++; // Very close proximity
        }
      });

      // Adjust size based on proximity - slightly smaller for clustered areas
      const proximityFactor = nearbyCount > 0 ? Math.max(0.85, 1 - (nearbyCount * 0.04)) : 1;
      const activitySizeFactor = isHighActivity ? 1.15 : venue.activity >= 60 ? 1.08 : 1;
      const selectionFactor = isSelected ? 1.25 : 1;
      // Increased minimum size for better visibility
      const markerSize = Math.max(32, Math.min(38, baseSize * 0.8)) * proximityFactor * activitySizeFactor * selectionFactor;
      const markerHeight = markerSize * 1.35;
      // Create teardrop marker element with entrance animation
      const staggerDelay = (index % 30) * 30;
      const el = document.createElement("div");
      el.className = "venue-marker";
      // Dim non-selected markers when a venue is selected
      const dimOpacity = hasSelection && !isSelected ? '0.45' : '1';
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
        z-index: ${isSelected ? '200' : isHighActivity ? '50' : '10'};
      `;

      // Determine pulse animation speed based on activity level
      // Disable pulse for reduced motion/low power mode
      const shouldAnimate = platformSettings.current.markerAnimation && isTabVisible;
      const pulseSpeed = venue.activity >= 80 ? '1.5s' : venue.activity >= 60 ? '2.5s' : '4s';
      const pulseOpacity = venue.activity >= 80 ? '0.8' : venue.activity >= 60 ? '0.5' : '0.3';
      
      // Create teardrop pin container
      const pinEl = document.createElement('div');
      pinEl.style.cssText = `
        width: ${markerSize}px;
        height: ${markerHeight}px;
        position: relative;
        transition: transform 0.2s ease;
        background: transparent;
        transform: ${isSelected ? 'scale(1.05)' : 'scale(1)'};
      `;

      // Layered depth: soft outer halo (blurred glow)
      const haloEl = document.createElement('div');
      const haloSize = markerSize + 22;
      const haloColor = isSelected ? GOLD : color;
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
        opacity: ${isSelected ? '0.95' : isHighActivity ? '0.7' : '0.45'};
      `;

      // Create animated gradient ring (behind teardrop) - with activity-based color
      // Only animate if not in low power/reduced motion mode
      const ringEl = document.createElement('div');
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
        opacity: ${isSelected ? '1' : pulseOpacity};
        box-shadow: ${isSelected || isHighActivity ? `0 0 12px ${GOLD}80` : 'none'};
        ${shouldAnimate ? `animation: markerRingPulse ${pulseSpeed} ease-in-out infinite;` : ''}
      `;

      // Create teardrop shape - glassmorphic design with frosted glass effect
      const teardropEl = document.createElement('div');
      const isDarkTheme = document.documentElement.classList.contains('dark');
      teardropEl.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: ${markerSize}px;
        height: ${markerSize}px;
        background: ${isDarkTheme 
          ? 'rgba(30, 30, 35, 0.75)' 
          : 'rgba(255, 255, 255, 0.8)'};
        backdrop-filter: blur(12px) saturate(180%);
        -webkit-backdrop-filter: blur(12px) saturate(180%);
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        transform-origin: center center;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1.5px solid ${isSelected ? GOLD : (isDarkTheme 
          ? `rgba(255, 255, 255, 0.15)` 
          : `rgba(0, 0, 0, 0.08)`)};
        box-shadow: 
          0 4px 16px rgba(0, 0, 0, ${isDarkTheme ? '0.4' : '0.15'}),
          inset 0 1px 0 rgba(255, 255, 255, ${isDarkTheme ? '0.1' : '0.5'}),
          0 0 0 1px ${isSelected ? GOLD : color}${isSelected ? '99' : '40'};
      `;
      
      // Category-aware iconography (counter-rotated to stay upright)
      const iconWrap = document.createElement('div');
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
        color: ${color};
        filter: drop-shadow(0 1px 2px rgba(0,0,0,0.35));
      `;
      iconWrap.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${iconSize}" height="${iconSize}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">${getCategoryIcon(venue.category)}</svg>`;
      teardropEl.appendChild(iconWrap);

      pinEl.appendChild(haloEl);
      pinEl.appendChild(ringEl);
      pinEl.appendChild(teardropEl);
      el.appendChild(pinEl);

      // Glassmorphic label chip (slides up on hover/selection)
      const dealCount = venueDealCounts[venue.id] || 0;
      const chipEl = document.createElement('div');
      chipEl.className = 'venue-marker-chip';
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
        background: ${isDarkTheme ? 'rgba(20, 20, 24, 0.78)' : 'rgba(255, 255, 255, 0.85)'};
        backdrop-filter: blur(14px) saturate(180%);
        -webkit-backdrop-filter: blur(14px) saturate(180%);
        border: 1px solid ${isDarkTheme ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)'};
        box-shadow: 0 6px 20px rgba(0,0,0,${isDarkTheme ? '0.5' : '0.18'}), 0 0 0 1px ${(isSelected ? GOLD : color)}40;
        color: ${isDarkTheme ? '#fff' : '#0a0a0a'};
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
      const nameSpan = document.createElement('span');
      nameSpan.textContent = venue.name;
      nameSpan.style.cssText = 'overflow:hidden;text-overflow:ellipsis;max-width:130px;';
      chipEl.appendChild(nameSpan);
      // Open / Closed status pill — mirrors JetCard logic so the marker chip
      // reflects the same business-hours signal as the detail card.
      const venueIsOpen: boolean | null = venueOpenStatus.get(venue.id) ?? null;
      if (venueIsOpen !== null) {
        const statusPill = document.createElement('span');
        statusPill.textContent = venueIsOpen ? 'Open' : 'Closed';
        statusPill.setAttribute(
          'aria-label',
          venueIsOpen ? `${venue.name} is open now` : `${venue.name} is closed`,
        );
        const openBg = isDarkTheme ? 'rgba(34, 197, 94, 0.18)' : 'rgba(34, 197, 94, 0.16)';
        const closedBg = isDarkTheme ? 'rgba(239, 68, 68, 0.18)' : 'rgba(239, 68, 68, 0.14)';
        statusPill.style.cssText = `
          display:inline-flex;align-items:center;gap:4px;
          padding: 2px 7px;
          border-radius: 999px;
          background: ${venueIsOpen ? openBg : closedBg};
          color: ${venueIsOpen ? 'hsl(var(--cool))' : 'hsl(var(--hot))'};
          border: 1px solid currentColor;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        `;
        const dot = document.createElement('span');
        dot.style.cssText = `
          width:6px;height:6px;border-radius:999px;
          background: currentColor;
          box-shadow: 0 0 6px currentColor;
        `;
        statusPill.prepend(dot);
        chipEl.appendChild(statusPill);
      }
      if (dealCount > 0) {
        const dealPill = document.createElement('span');
        dealPill.textContent = `${dealCount} deal${dealCount > 1 ? 's' : ''}`;
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
      const caretEl = document.createElement('div');
      caretEl.style.cssText = `
        position: absolute;
        bottom: -4px;
        left: 50%;
        transform: translateX(-50%) rotate(45deg);
        width: 8px;
        height: 8px;
        background: inherit;
        border-right: 1px solid ${isDarkTheme ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)'};
        border-bottom: 1px solid ${isDarkTheme ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)'};
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
        chipEl.style.opacity = '0';
        chipEl.style.transform = 'translateX(-50%) translateY(6px)';
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
        chipEl.style.opacity = '1';
        chipEl.style.transform = 'translateX(-50%) translateY(0)';
        activeChipRef.current = { el: chipEl, venueId: venue.id, hide: hideChipNow };
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
          0 8px 24px rgba(0, 0, 0, ${isDarkTheme ? '0.5' : '0.2'}),
          inset 0 1px 0 rgba(255, 255, 255, ${isDarkTheme ? '0.15' : '0.6'}),
          0 0 0 2px ${isSelected ? GOLD : color}90
        `;
        ringEl.style.opacity = '1';
        haloEl.style.opacity = '1';
        showChip();
      });

      el.addEventListener("pointerleave", (e) => {
        if ((e as PointerEvent).pointerType !== "mouse") return;
        el.style.zIndex = isSelected ? "200" : isHighActivity ? "50" : "10";
        pinEl.style.transform = isSelected ? "scale(1.05)" : "scale(1)";
        teardropEl.style.boxShadow = `
          0 4px 16px rgba(0, 0, 0, ${isDarkTheme ? '0.4' : '0.15'}),
          inset 0 1px 0 rgba(255, 255, 255, ${isDarkTheme ? '0.1' : '0.5'}),
          0 0 0 1px ${isSelected ? GOLD : color}${isSelected ? '99' : '40'}
        `;
        ringEl.style.opacity = isSelected ? '1' : pulseOpacity;
        haloEl.style.opacity = isSelected ? '0.95' : isHighActivity ? '0.7' : '0.45';
        hideChipUnlessSelected();
      });
      // Touch: open immediately on tap. The subsequent click promotes the
      // marker to selected, so the chip stays open via React re-render.
      // No auto-hide timer — avoids flicker on quick taps. Off-map taps and
      // selecting a different marker close it cleanly.
      el.addEventListener("touchstart", () => {
        showChip();
      }, { passive: true });

      // Create marker with bottom anchor for teardrop (pin point at GPS location)
      if (!mapboxglRef.current) return;
      const marker = new mapboxglRef.current.Marker({
        element: el,
        anchor: 'bottom'
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
        triggerHaptic('medium');
        
        // Open venue card (use ref to avoid stale closure)
        onVenueSelectRef.current(venue);
      });

      markersRef.current.push(marker);
    });
    
    }); // Close requestAnimationFrame
  };

  // Call updateMarkers on initial load and when venues change
  useEffect(() => {
    updateMarkers();
  }, [venues, mapLoaded, isLoadingVenues, selectedCity, selectedVenue, venueDealCounts, openNowOnly, venueOpenStatus]);

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
        if (row.venue_id) counts[row.venue_id] = (counts[row.venue_id] || 0) + 1;
      }
      setVenueDealCounts(counts);
    })();
    return () => { cancelled = true; };
  }, [venues]);

  // Add heatmap blend layer for clustering visualization at low zoom levels
  useEffect(() => {
    if (!map.current || !mapLoaded || venues.length === 0) return;

    const mapInstance = map.current;
    const sourceId = 'venue-heatmap-source';
    const heatmapLayerId = 'venue-heatmap-layer';

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
      console.warn('[Heatmap] Error cleaning up existing source/layer:', e);
    }

    // Create GeoJSON data from venues with activity as weight
    const geojsonData: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: venues.map(venue => ({
        type: 'Feature',
        properties: {
          activity: venue.activity,
          name: venue.name
        },
        geometry: {
          type: 'Point',
          coordinates: [venue.lng, venue.lat]
        }
      }))
    };

    // Add source - check again that it doesn't exist
    try {
      if (!mapInstance.getSource(sourceId)) {
        mapInstance.addSource(sourceId, {
          type: 'geojson',
          data: geojsonData
        });
      } else {
        // Update existing source data
        const source = mapInstance.getSource(sourceId) as mapboxgl.GeoJSONSource;
        source.setData(geojsonData);
      }
    } catch (e) {
      console.warn('[Heatmap] Error adding source:', e);
      return;
    }

    // Add heatmap layer that fades out at higher zoom levels
    try {
      if (!mapInstance.getLayer(heatmapLayerId)) {
        mapInstance.addLayer({
          id: heatmapLayerId,
          type: 'heatmap',
          source: sourceId,
          maxzoom: 15,
          paint: {
            // Weight based on activity level
            'heatmap-weight': [
              'interpolate',
              ['linear'],
              ['get', 'activity'],
              0, 0.1,
              50, 0.5,
              80, 0.8,
              100, 1
            ],
            // Intensity increases with zoom
            'heatmap-intensity': [
              'interpolate',
              ['linear'],
              ['zoom'],
              8, isMobile ? 0.75 : 0.6,
              12, isMobile ? 0.9 : 1,
              15, isMobile ? 1.25 : 1.5
            ],
            // Color gradient - matches app theme (orange/red primary)
            'heatmap-color': [
              'interpolate',
              ['linear'],
              ['heatmap-density'],
              0, 'rgba(0, 0, 0, 0)',
              0.1, 'rgba(255, 140, 0, 0.15)',
              0.3, 'rgba(255, 100, 50, 0.3)',
              0.5, 'rgba(255, 69, 58, 0.45)',
              0.7, 'rgba(255, 45, 85, 0.6)',
              0.9, 'rgba(200, 50, 120, 0.75)',
              1, 'rgba(150, 50, 150, 0.9)'
            ],
            // Radius increases at lower zoom, decreases when zoomed in
            'heatmap-radius': [
              'interpolate',
              ['cubic-bezier', 0.4, 0, 0.2, 1],
              ['zoom'],
              8, isMobile ? 40 : 30,
              10, isMobile ? 34 : 25,
              12, isMobile ? 28 : 20,
              13, isMobile ? 22 : 16,
              15, isMobile ? 14 : 10
            ],
            // Fade out opacity as zoom increases (individual markers take over)
            'heatmap-opacity': [
              'interpolate',
              ['cubic-bezier', 0.4, 0, 0.2, 1],
              ['zoom'],
              10, isMobile ? 0.7 : 0.8,
              11.5, isMobile ? 0.58 : 0.65,
              13, isMobile ? 0.32 : 0.4,
              14, isMobile ? 0.15 : 0.2,
              15, 0
            ],
            // Smooth tween between paint updates (city switch, viewport flip)
            'heatmap-radius-transition': { duration: 400, delay: 0 },
            'heatmap-opacity-transition': { duration: 500, delay: 0 }
          }
        }, 'waterway-label'); // Insert below labels
      }
    } catch (e) {
      console.warn('[Heatmap] Error adding layer:', e);
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
            const orbEl = el.querySelector('div') as HTMLElement;
            if (orbEl) {
              // Update orb size
              orbEl.style.width = `${newBaseSize}px`;
              orbEl.style.height = `${newBaseSize}px`;
              
              // Update core size
              const coreEl = orbEl.querySelector('div:not([style*="position: absolute"])') as HTMLElement;
              if (coreEl && !coreEl.style.position?.includes('absolute')) {
                const coreSize = newBaseSize * 0.55;
                coreEl.style.width = `${coreSize}px`;
                coreEl.style.height = `${coreSize}px`;
                
                const svg = coreEl.querySelector('svg');
                if (svg) {
                  svg.setAttribute('width', `${coreSize * 0.55}`);
                  svg.setAttribute('height', `${coreSize * 0.55}`);
                }
              }
            }
          }, delay);
        }
      });
    };

    // Removed fade effect during panning - markers now stay fully visible and anchored

    mapInstance.on('zoom', handleZoom);
    
    return () => {
      mapInstance.off('zoom', handleZoom);
    };
  }, [mapLoaded, venues]);

  // Update map view when selected city changes
  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    
    map.current.flyTo({
      center: [selectedCity.lng, selectedCity.lat],
      zoom: selectedCity.zoom,
      pitch: isMobile ? 30 : 50,
      duration: 2000,
      essential: true
    });
    
    // Update markers after city change animation completes
    setTimeout(() => {
      updateMarkers();
    }, 2100);
  }, [selectedCity, mapLoaded, isMobile]);

  // Deal markers removed - no longer displaying colored circles on map

  return (
    <div 
      className="relative"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        minHeight: '100%',
        // DO NOT use contain: layout — it creates a containing block for fixed children,
        // breaking fixed positioning of overlay controls.
        // DO NOT use transform or will-change: transform — breaks backdrop-filter rendering.
        contain: 'style',
        isolation: 'isolate',
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
            if (e.propertyName === 'opacity' && mapLoaded) {
              setSkeletonMounted(false);
            }
          }}
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 40,
            transition: 'opacity 400ms ease-out',
            opacity: mapLoaded ? 0 : 1,
            pointerEvents: mapLoaded ? 'none' : 'auto',
            willChange: 'opacity',
          }}
        >
          {/* Opaque while the GL module loads, then translucent so tiles
              bleed through during the single crossfade. */}
          <HeatmapSkeleton translucent={loadingStage !== 'module'} />
        </div>
      )}

      {/* Map Error State with Retry - deferred to not become LCP element */}
      {mapError && !mapInitializing && (
        <div 
          className="bg-background/95 backdrop-blur-sm"
          style={{ position: 'absolute', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', contentVisibility: 'auto' }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: '24px', maxWidth: '24rem', textAlign: 'center' }}>
            <div className="rounded-full bg-destructive/10" style={{ width: '56px', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <AlertCircle className="w-7 h-7 text-destructive" aria-hidden="true" />
            </div>
            <div className="space-y-2">
              {/* h3 is larger - should be LCP if error shows, not the p tag */}
              <h3 className="text-lg font-semibold text-foreground">Map Loading Failed</h3>
              {/* Small text won't be LCP candidate due to smaller size */}
              <p className="text-xs text-muted-foreground leading-relaxed">{mapError}</p>
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
                  setLoadingStage('module');
                  // Reset the module promise to force a fresh load attempt
                  mapboxLoadPromise = null;
                  setRetryCount(c => c + 1);
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
          width: '100%', 
          height: '100%',
          minWidth: '100%',
          minHeight: '100%',
          touchAction: isMobile ? 'manipulation' : 'none',
          WebkitOverflowScrolling: 'touch',
          // DO NOT use transform or will-change here — breaks backdrop-filter on sibling overlays
          // and creates a containing block that traps fixed-position children
        }}
      />

      {/* Unified Top-Left Controls: Location + Map Style in one compact row */}
      {controlsReady && (
      <div 
        style={{
          position: 'absolute',
          display: 'flex',
          alignItems: 'center',
          top: 'var(--map-ui-inset-top, 0.75rem)',
          left: 'var(--map-ui-inset-left, 0.75rem)',
          gap: 'clamp(4px, 0.8vw, 8px)',
          zIndex: 30,
        }}
      >
        <Select
          value={isUsingCurrentLocation ? "current-location" : selectedCity.id}
          onOpenChange={(open) => {
            if (!open) setCitySearchQuery("");
            // Notify floating panels (e.g. SearchResults) to recalc position
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('jet:floating-ui-toggle', { detail: { source: 'city-select', open } }));
            }
          }}
          onValueChange={(value) => {
            // Haptic feedback for city selection
            triggerHaptic('light');
            
            if (value === "current-location") {
              setIsUsingCurrentLocation(true);
              // Immediately sync the parent's selectedCity to the already-known
              // nearest city so data filters update without waiting for a fresh
              // geolocate event.
              if (detectedCity && detectedCity.id !== selectedCity.id) {
                onCityChange(detectedCity);
              }
              // Fly to user's current location if known
              if (userLocation && map.current) {
                map.current.flyTo({
                  center: [userLocation.lng, userLocation.lat],
                  zoom: Math.max(map.current.getZoom(), 13),
                  duration: 1500,
                  essential: true
                });
              } else if (geolocateControlRef.current) {
                // Trigger geolocation if location not yet known
                geolocateControlRef.current.trigger();
              }
            } else {
              setIsUsingCurrentLocation(false);
              const city = CITIES.find(c => c.id === value);
              if (city) {
                onCityChange(city);
                // Fly to selected city
                if (map.current) {
                  map.current.flyTo({
                    center: [city.lng, city.lat],
                    zoom: city.zoom,
                    duration: 1500,
                    essential: true
                  });
                }
              }
            }
          }}
        >
          <SelectTrigger 
            className="text-[11px] sm:text-xs shadow-xl"
            aria-label="Select city location"
            aria-haspopup="listbox"
            style={{
              height: 'clamp(36px, 5.5vw, 44px)',
              paddingLeft: 'clamp(12px, 1.75vw, 16px)',
              paddingRight: 'clamp(12px, 1.75vw, 16px)',
              // Fixed width prevents trigger from resizing when selecting cities of different name lengths
              width: 'clamp(176px, 22vw, 240px)',
              minWidth: 'clamp(176px, 22vw, 240px)',
              maxWidth: 'var(--map-control-max-width, 240px)',
              contain: 'layout style',
              background: 'hsl(var(--card) / 0.78)',
              backdropFilter: 'blur(24px) saturate(1.6)',
              WebkitBackdropFilter: 'blur(24px) saturate(1.6)',
              borderRadius: '9999px',
              border: '1.5px solid transparent',
              backgroundClip: 'padding-box',
              boxShadow: '0 0 0 1.5px hsl(var(--primary) / 0.28), 0 10px 28px -6px rgba(0,0,0,0.22)',
            }}
          >
            <div className="flex items-center gap-2.5 w-full">
              <MapPin className="w-4 h-4 text-primary flex-shrink-0 self-center" aria-hidden="true" />
              <span
                className="font-display font-bold truncate flex-1 text-left text-foreground text-[12px] sm:text-[13px] leading-tight self-center"
                style={{ letterSpacing: '-0.015em' }}
              >
                {isUsingCurrentLocation
                  ? (detectedLocationName || (detectedCity ? `${detectedCity.name}, ${detectedCity.state}` : "Locating..."))
                  : `${selectedCity.name}, ${selectedCity.state}`}
              </span>
              {isUsingCurrentLocation && (detectedLocationName || detectedCity) && (
                <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse flex-shrink-0 self-center" aria-hidden="true" />
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
                const navKeys = ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter', 'Escape', 'Tab', 'PageUp', 'PageDown'];
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
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
            {!citySearchQuery && (
            <SelectItem value="current-location" className="py-3 px-2.5 my-0.5 rounded-lg focus:bg-primary/10">
              <div className="flex items-center gap-3 w-full min-w-0">
                <span className="w-2 h-2 bg-primary rounded-full animate-pulse flex-shrink-0" aria-hidden="true" />
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="font-display font-bold text-sm text-foreground truncate" style={{ letterSpacing: '-0.01em', lineHeight: 1.2 }}>
                    {detectedLocationName
                      ? detectedLocationName
                      : (detectedCity ? `${detectedCity.name}, ${detectedCity.state}` : "Use my location")}
                  </span>
                  <span className="text-[10px] text-muted-foreground truncate" style={{ lineHeight: 1.2 }}>
                    {userLocation ? "Current Location" : "Tap to detect your spot"}
                  </span>
                </div>
                <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-primary/90 flex-shrink-0 px-1.5 py-0.5 rounded-full border border-primary/30 bg-primary/10">
                  Live
                </span>
              </div>
            </SelectItem>
            )}
            {!citySearchQuery && <div className="h-px bg-border/60 my-1.5 mx-2" />}
            {(() => {
              const baseList = userLocation
                ? getCitiesSortedByDistance(userLocation.lat, userLocation.lng)
                : CITIES.map(c => ({ ...c, distanceKm: 0 }));
              const q = citySearchQuery.trim().toLowerCase();
              const filtered = q
                ? baseList.filter(c =>
                    c.name.toLowerCase().includes(q) ||
                    c.state.toLowerCase().includes(q) ||
                    `${c.name}, ${c.state}`.toLowerCase().includes(q)
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
              const distanceMiles = userLocation ? kmToMiles(city.distanceKm) : null;
              return (
                <SelectItem
                  key={city.id}
                  value={city.id}
                  className="py-2.5 px-2.5 my-0.5 rounded-lg focus:bg-primary/10"
                >
                  <div
                    className="flex items-center w-full min-w-0"
                    style={{ gap: 'clamp(6px, 1.5vw, 12px)' }}
                  >
                    {/* City name — flexes and truncates so it never wraps */}
                    <span
                      className="font-display font-bold text-[13px] sm:text-sm text-foreground truncate min-w-0 flex-1"
                      style={{ letterSpacing: '-0.005em', lineHeight: 1.3 }}
                    >
                      {city.name}
                    </span>

                    {/* State code — fixed-width chip, never shrinks */}
                    <span
                      className="text-[10px] sm:text-[11px] font-semibold uppercase text-muted-foreground tabular-nums flex-shrink-0"
                      style={{ letterSpacing: '0.1em', minWidth: '1.75rem', textAlign: 'center', paddingLeft: 'clamp(2px, 0.5vw, 6px)', paddingRight: 'clamp(2px, 0.5vw, 6px)' }}
                    >
                      {city.state}
                    </span>

                    {/* Distance — right-aligned, fixed width, never wraps */}
                    {distanceMiles !== null && (
                      <span
                        className="text-[10px] sm:text-[11px] font-medium text-muted-foreground/80 tabular-nums flex-shrink-0 text-right whitespace-nowrap"
                        style={{ letterSpacing: '0.02em', minWidth: '5.5rem', marginLeft: 'clamp(2px, 0.5vw, 6px)' }}
                      >
                        {distanceMiles < 1 ? 'Nearby' : `${Math.round(distanceMiles)} mi away`}
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
                width: 'clamp(32px, 5vw, 40px)',
                height: 'clamp(32px, 5vw, 40px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '12px',
                background: 'hsl(var(--card) / 0.7)',
                border: '1px solid hsl(var(--border) / 0.4)',
                boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.05)',
                backdropFilter: 'blur(24px)',
                WebkitBackdropFilter: 'blur(24px)',
                cursor: 'pointer',
                color: 'hsl(var(--foreground))',
              }}
            >
              <Palette style={{ width: '16px', height: '16px' }} aria-hidden="true" />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: '6px',
            zIndex: 20,
            overflow: 'hidden',
          }}>
            <div style={{
              background: 'hsl(var(--card) / 0.8)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              borderRadius: '12px',
              border: '1px solid hsl(var(--border) / 0.4)',
              padding: '8px',
              boxShadow: '0 10px 25px -5px rgba(0,0,0,0.15)',
              minWidth: '200px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }} role="group" aria-label="Map base style">
                <span style={{ fontSize: '9px', color: 'hsl(var(--muted-foreground))', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Style</span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px' }} role="radiogroup">
                  {(['light', 'dark', 'streets', 'satellite'] as const).map((style) => (
                    <button
                      key={style}
                      onClick={() => { triggerHaptic('light'); setMapStyle(style); }}
                      aria-pressed={mapStyle === style}
                      style={{
                        height: '28px',
                        fontSize: '9px',
                        padding: '0 6px',
                        textTransform: 'capitalize',
                        borderRadius: '8px',
                        border: mapStyle === style ? '1px solid hsl(var(--primary))' : '1px solid hsl(var(--border))',
                        background: mapStyle === style ? 'hsl(var(--primary))' : 'transparent',
                        color: mapStyle === style ? 'hsl(var(--primary-foreground))' : 'hsl(var(--foreground))',
                        cursor: 'pointer',
                        fontWeight: 600,
                        transition: 'all 0.2s',
                      }}
                    >
                      {style}
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={() => { triggerHaptic('medium'); setShow3DTerrain(!show3DTerrain); }}
                aria-pressed={show3DTerrain}
                style={{
                  width: '100%',
                  height: '28px',
                  fontSize: '10px',
                  fontWeight: 600,
                  borderRadius: '8px',
                  border: show3DTerrain ? '1px solid hsl(var(--primary))' : '1px solid hsl(var(--border))',
                  background: show3DTerrain ? 'hsl(var(--primary))' : 'transparent',
                  color: show3DTerrain ? 'hsl(var(--primary-foreground))' : 'hsl(var(--foreground))',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
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
          position: 'absolute',
          bottom: 'var(--map-fixed-bottom, calc(60px + 0.75rem))',
          right: 'var(--map-ui-inset-right, 0.75rem)',
          zIndex: 30,
        }}
      >
        {/* Expanded panel - slides up from FAB */}
        <div 
          style={{
            width: isMobile ? 'min(240px, 60vw)' : '180px',
            contain: 'layout style',
            overflow: 'hidden',
            transition: 'max-height 300ms ease-out, opacity 300ms ease-out, margin-bottom 300ms ease-out',
            maxHeight: !controlsCollapsed ? '600px' : '0px',
            opacity: !controlsCollapsed ? 1 : 0,
            marginBottom: !controlsCollapsed ? '8px' : '0px',
          }}
        >
          <div style={{
            background: 'hsl(var(--card) / 0.95)',
            backdropFilter: 'blur(24px) saturate(1.6)',
            WebkitBackdropFilter: 'blur(24px) saturate(1.6)',
            borderRadius: '12px',
            border: '1px solid hsl(var(--border))',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)',
            padding: '10px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            maxHeight: 'calc(100dvh - var(--map-fixed-bottom, 72px) - 252px)',
            overflowY: 'auto',
            overscrollBehavior: 'contain',
          }}>
            {/* Panel header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: 'hsl(var(--card) / 0.95)', backdropFilter: 'blur(24px) saturate(1.6)', WebkitBackdropFilter: 'blur(24px) saturate(1.6)', zIndex: 1, paddingBottom: '4px', marginTop: '-2px' }}>
              <span style={{ fontSize: '10px', fontWeight: 600, color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Layers</span>
              <button 
                onClick={() => { triggerHaptic('light'); setControlsCollapsed(true); }}
                style={{ width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', transition: 'background 0.2s', cursor: 'pointer', background: 'transparent', border: 'none' }}
              >
                <X style={{ width: '12px', height: '12px', color: 'hsl(var(--muted-foreground))' }} />
              </button>
            </div>

            {/* Compact live activity summary — always shows live status of
                Density and Movement Paths regardless of toggle state */}
            <div
              className="chip-summary"
              role="status"
              aria-live="polite"
            >
              {[
                {
                  key: 'density',
                  label: 'Density',
                  loading: densityLoading,
                  count: densityData?.stats.grid_cells ?? 0,
                  active: showDensityLayer,
                },
                {
                  key: 'paths',
                  label: 'Paths',
                  loading: pathsLoading,
                  count: pathData?.stats.total_paths ?? 0,
                  active: showMovementPaths,
                },
              ].map((chip) => (
                <div
                  key={chip.key}
                  className="chip-summary-item"
                  title={`${chip.label}: ${chip.loading ? 'updating' : chip.count.toLocaleString()}${chip.active ? ' (layer on)' : ''}`}
                >
                  {chip.loading ? (
                    <Loader2 aria-hidden className="animate-spin" style={{ width: '10px', height: '10px', color: 'hsl(var(--primary))', flexShrink: 0 }} />
                  ) : (
                    <span
                      aria-hidden
                      style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '9999px',
                        flexShrink: 0,
                        background: chip.count > 0 ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground) / 0.4)',
                        boxShadow: chip.count > 0 ? '0 0 6px hsl(var(--primary) / 0.7)' : 'none',
                      }}
                    />
                  )}
                  <span className="chip-summary-label" style={{ color: chip.active ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))' }}>
                    {chip.label}
                  </span>
                  <span
                    className="chip-summary-value"
                    style={{ opacity: chip.loading ? 0.5 : 1 }}
                  >
                    {chip.loading ? '…' : chip.count.toLocaleString()}
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
                triggerHaptic('medium');
                const newState = !showDensityLayer;
                setShowDensityLayer(newState);
                if (newState) {
                  setTimeFilter('all');
                  setHourFilter(undefined);
                  setDayFilter(undefined);
                  scheduleDensityRefresh();
                } else {
                  clearDensityRefreshTimer();
                  setIsLoadingHeatmap(false);
                }
              }}
            />

            {/* Heat filters - shown when heat is on */}
            <div style={{ overflow: 'hidden', transition: 'max-height 0.2s', maxHeight: showDensityLayer ? '240px' : '0px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingLeft: '10px', paddingTop: '8px', paddingBottom: '2px' }}>
                {/* Time-lapse toggle — glassmorphic pill matching LayerToggleRow */}
                <button
                  type="button"
                  aria-pressed={timelapseMode}
                  onClick={() => {
                    triggerHaptic('medium');
                    const newMode = !timelapseMode;
                    setTimelapseMode(newMode);
                    if (newMode) timelapse.loadHourlyData();
                  }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '7px 10px',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    border: timelapseMode
                      ? '1px solid hsl(var(--primary) / 0.45)'
                      : '1px solid hsl(var(--border) / 0.5)',
                    background: timelapseMode
                      ? 'linear-gradient(135deg, hsl(var(--primary) / 0.18), hsl(var(--primary-glow) / 0.14))'
                      : 'hsl(var(--card) / 0.5)',
                    backdropFilter: 'blur(12px) saturate(1.4)',
                    WebkitBackdropFilter: 'blur(12px) saturate(1.4)',
                    boxShadow: timelapseMode
                      ? '0 8px 24px -10px hsl(var(--primary) / 0.55), inset 0 0 0 1px hsl(var(--primary-glow) / 0.18)'
                      : 'inset 0 0 0 1px hsl(0 0% 100% / 0.03)',
                    transition: 'background 220ms cubic-bezier(0.16,1,0.3,1), border-color 220ms ease, box-shadow 220ms ease',
                  }}
                >
                  <span
                    style={{
                      width: '22px', height: '22px', borderRadius: '7px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      background: timelapseMode
                        ? 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary-glow)))'
                        : 'hsl(var(--background) / 0.6)',
                      color: timelapseMode ? 'hsl(var(--primary-foreground))' : 'hsl(var(--muted-foreground))',
                      border: timelapseMode ? '1px solid transparent' : '1px solid hsl(var(--border) / 0.6)',
                      boxShadow: timelapseMode ? '0 4px 12px -4px hsl(var(--primary) / 0.6)' : 'none',
                    }}
                  >
                    <Clock style={{ width: '12px', height: '12px' }} strokeWidth={2.25} />
                  </span>
                  <span className="font-display" style={{ flex: 1, textAlign: 'left', fontSize: '11px', fontWeight: 700, letterSpacing: '-0.005em', color: timelapseMode ? 'hsl(var(--foreground))' : 'hsl(var(--foreground) / 0.75)' }}>
                    {timelapseMode ? 'Time-lapse On' : 'Time-lapse'}
                  </span>
                  <span aria-hidden="true" style={{
                    width: '7px', height: '7px', borderRadius: '9999px', flexShrink: 0,
                    background: timelapseMode
                      ? 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary-glow)))'
                      : 'hsl(var(--muted-foreground) / 0.25)',
                    boxShadow: timelapseMode
                      ? '0 0 10px hsl(var(--primary) / 0.7), 0 0 2px hsl(var(--primary-glow) / 0.6)'
                      : 'inset 0 0 0 1px hsl(var(--border))',
                  }} />
                </button>

                {/* Time-lapse controls — glassmorphic card */}
                {timelapseMode && (
                  <div style={{
                    display: 'flex', flexDirection: 'column', gap: '8px',
                    padding: '10px',
                    borderRadius: '10px',
                    background: 'hsl(var(--card) / 0.5)',
                    border: '1px solid hsl(var(--border) / 0.5)',
                    backdropFilter: 'blur(12px) saturate(1.4)',
                    WebkitBackdropFilter: 'blur(12px) saturate(1.4)',
                    boxShadow: 'inset 0 0 0 1px hsl(0 0% 100% / 0.03)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <button type="button" onClick={() => { triggerHaptic('light'); timelapse.stepBackward(); }} disabled={timelapse.isPlaying}
                        style={{ width: '26px', height: '26px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px', border: '1px solid hsl(var(--border) / 0.6)', background: 'hsl(var(--background) / 0.6)', color: 'hsl(var(--foreground) / 0.8)', cursor: timelapse.isPlaying ? 'not-allowed' : 'pointer', opacity: timelapse.isPlaying ? 0.5 : 1 }}>
                        <SkipBack style={{ width: '12px', height: '12px' }} />
                      </button>
                      <button type="button" onClick={() => { triggerHaptic('medium'); timelapse.isPlaying ? timelapse.pause() : timelapse.play(); }}
                        style={{
                          flex: 1, height: '26px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                          borderRadius: '8px',
                          border: timelapse.isPlaying ? '1px solid transparent' : '1px solid hsl(var(--border) / 0.6)',
                          background: timelapse.isPlaying
                            ? 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary-glow)))'
                            : 'hsl(var(--background) / 0.6)',
                          color: timelapse.isPlaying ? 'hsl(var(--primary-foreground))' : 'hsl(var(--foreground))',
                          fontSize: '10px', fontWeight: 700, cursor: 'pointer',
                          boxShadow: timelapse.isPlaying ? '0 4px 12px -4px hsl(var(--primary) / 0.6)' : 'none',
                        }}>
                        {timelapse.isPlaying ? <Pause style={{ width: '12px', height: '12px' }} /> : <Play style={{ width: '12px', height: '12px' }} />}
                      </button>
                      <button type="button" onClick={() => { triggerHaptic('light'); timelapse.stepForward(); }} disabled={timelapse.isPlaying}
                        style={{ width: '26px', height: '26px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px', border: '1px solid hsl(var(--border) / 0.6)', background: 'hsl(var(--background) / 0.6)', color: 'hsl(var(--foreground) / 0.8)', cursor: timelapse.isPlaying ? 'not-allowed' : 'pointer', opacity: timelapse.isPlaying ? 0.5 : 1 }}>
                        <SkipForward style={{ width: '12px', height: '12px' }} />
                      </button>
                    </div>
                    <div className="font-display" style={{ textAlign: 'center', fontSize: '11px', fontWeight: 700, letterSpacing: '0.02em', background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary-glow)))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>{timelapse.formatHour(timelapse.currentHour)}</div>
                    <Slider value={[timelapse.currentHour]} onValueChange={([v]) => timelapse.setHour(v)} min={0} max={23} step={1} className="w-full" disabled={timelapse.isPlaying} />
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {[2, 1, 0.5].map((speed) => {
                        const isActive = timelapse.speed === speed;
                        return (
                          <button key={speed} type="button" onClick={() => timelapse.setSpeed(speed)}
                            style={{
                              flex: 1, height: '22px', borderRadius: '7px',
                              fontSize: '9px', fontWeight: 700, letterSpacing: '0.02em',
                              border: isActive ? '1px solid transparent' : '1px solid hsl(var(--border) / 0.6)',
                              background: isActive
                                ? 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary-glow)))'
                                : 'hsl(var(--background) / 0.6)',
                              color: isActive ? 'hsl(var(--primary-foreground))' : 'hsl(var(--foreground) / 0.75)',
                              boxShadow: isActive ? '0 4px 12px -4px hsl(var(--primary) / 0.6)' : 'none',
                              cursor: 'pointer',
                              transition: 'background 200ms ease, color 200ms ease, box-shadow 200ms ease',
                            }}>
                            {speed === 2 ? '0.5x' : speed === 1 ? '1x' : '2x'}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Regular filters — glassmorphic selects */}
                {!timelapseMode && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <Select value={timeFilter} onValueChange={(v: any) => setTimeFilter(v)}>
                      <SelectTrigger
                        className="w-full font-display font-semibold rounded-[10px] min-h-0 h-auto map-filter-pill"
                        style={{
                          padding: 'clamp(6px, 1.6vw, 8px) clamp(8px, 2.2vw, 12px)',
                          fontSize: 'clamp(10px, 2.6vw, 12px)',
                          flexDirection: 'row',
                          flexWrap: 'nowrap',
                          border: timeFilter !== 'all'
                            ? '1px solid hsl(var(--primary) / 0.45)'
                            : '1px solid hsl(var(--border) / 0.5)',
                          background: timeFilter !== 'all'
                            ? 'linear-gradient(135deg, hsl(var(--primary) / 0.18), hsl(var(--primary-glow) / 0.14))'
                            : 'hsl(var(--card) / 0.5)',
                          backdropFilter: 'blur(12px) saturate(1.4)',
                          WebkitBackdropFilter: 'blur(12px) saturate(1.4)',
                          boxShadow: timeFilter !== 'all'
                            ? '0 8px 24px -10px hsl(var(--primary) / 0.55), inset 0 0 0 1px hsl(var(--primary-glow) / 0.18)'
                            : 'inset 0 0 0 1px hsl(0 0% 100% / 0.03)',
                          letterSpacing: '-0.005em',
                          color: timeFilter !== 'all' ? 'hsl(var(--foreground))' : undefined,
                          transition: 'background 220ms cubic-bezier(0.16,1,0.3,1), border-color 220ms ease, box-shadow 220ms ease, color 220ms ease',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(6px, 1.6vw, 10px)', flex: 1, minWidth: 0 }}>
                          <span style={{
                            width: 'clamp(20px, 5.2vw, 24px)', height: 'clamp(20px, 5.2vw, 24px)', borderRadius: '7px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                            background: timeFilter !== 'all'
                              ? 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary-glow)))'
                              : 'hsl(var(--background) / 0.6)',
                            border: timeFilter !== 'all'
                              ? '1px solid transparent'
                              : '1px solid hsl(var(--border) / 0.6)',
                            boxShadow: timeFilter !== 'all'
                              ? '0 4px 12px -4px hsl(var(--primary) / 0.6)'
                              : 'none',
                            transition: 'background 220ms ease, border-color 220ms ease, box-shadow 220ms ease',
                          }}>
                            <Clock style={{ width: '12px', height: '12px', color: timeFilter !== 'all' ? 'hsl(var(--primary-foreground))' : 'hsl(var(--muted-foreground))' }} strokeWidth={2.25} />
                          </span>
                          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>
                            <SelectValue placeholder="Time" />
                          </span>
                        </div>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Time</SelectItem>
                        <SelectItem value="today">Today</SelectItem>
                        <SelectItem value="this_week">This Week</SelectItem>
                        <SelectItem value="this_hour">This Hour</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={dayFilter?.toString() || "all"} onValueChange={(v) => setDayFilter(v === "all" ? undefined : parseInt(v))}>
                      <SelectTrigger
                        className="w-full font-display font-semibold rounded-[10px] min-h-0 h-auto map-filter-pill"
                        style={{
                          padding: 'clamp(6px, 1.6vw, 8px) clamp(8px, 2.2vw, 12px)',
                          fontSize: 'clamp(10px, 2.6vw, 12px)',
                          flexDirection: 'row',
                          flexWrap: 'nowrap',
                          border: dayFilter !== undefined
                            ? '1px solid hsl(var(--primary) / 0.45)'
                            : '1px solid hsl(var(--border) / 0.5)',
                          background: dayFilter !== undefined
                            ? 'linear-gradient(135deg, hsl(var(--primary) / 0.18), hsl(var(--primary-glow) / 0.14))'
                            : 'hsl(var(--card) / 0.5)',
                          backdropFilter: 'blur(12px) saturate(1.4)',
                          WebkitBackdropFilter: 'blur(12px) saturate(1.4)',
                          boxShadow: dayFilter !== undefined
                            ? '0 8px 24px -10px hsl(var(--primary) / 0.55), inset 0 0 0 1px hsl(var(--primary-glow) / 0.18)'
                            : 'inset 0 0 0 1px hsl(0 0% 100% / 0.03)',
                          letterSpacing: '-0.005em',
                          color: dayFilter !== undefined ? 'hsl(var(--foreground))' : undefined,
                          transition: 'background 220ms cubic-bezier(0.16,1,0.3,1), border-color 220ms ease, box-shadow 220ms ease, color 220ms ease',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(6px, 1.6vw, 10px)', flex: 1, minWidth: 0 }}>
                          <span style={{
                            width: 'clamp(20px, 5.2vw, 24px)', height: 'clamp(20px, 5.2vw, 24px)', borderRadius: '7px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                            background: dayFilter !== undefined
                              ? 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary-glow)))'
                              : 'hsl(var(--background) / 0.6)',
                            border: dayFilter !== undefined
                              ? '1px solid transparent'
                              : '1px solid hsl(var(--border) / 0.6)',
                            boxShadow: dayFilter !== undefined
                              ? '0 4px 12px -4px hsl(var(--primary) / 0.6)'
                              : 'none',
                            transition: 'background 220ms ease, border-color 220ms ease, box-shadow 220ms ease',
                          }}>
                            <Calendar style={{ width: '12px', height: '12px', color: dayFilter !== undefined ? 'hsl(var(--primary-foreground))' : 'hsl(var(--muted-foreground))' }} strokeWidth={2.25} />
                          </span>
                          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>
                            <SelectValue placeholder="Day" />
                          </span>
                        </div>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Days</SelectItem>
                        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d, i) => (
                          <SelectItem key={i} value={i.toString()}>{d}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Density status — loading / error */}
                {(isLoadingHeatmap || densityError) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px', borderRadius: '8px', fontSize: '10px', background: densityError ? 'hsl(var(--destructive) / 0.1)' : 'hsl(var(--primary) / 0.08)' }}>
                    {isLoadingHeatmap ? (
                      <>
                        <Loader2 className="animate-spin" style={{ width: '12px', height: '12px', color: 'hsl(var(--primary))', flexShrink: 0 }} />
                        <span style={{ color: 'hsl(var(--foreground))' }}>Refreshing heatmap...</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle style={{ width: '12px', height: '12px', color: 'hsl(var(--destructive))', flexShrink: 0 }} />
                        <span style={{ color: 'hsl(var(--destructive))' }}>Failed</span>
                        <Button onClick={refreshDensity} variant="ghost" size="sm" className="h-5 text-[9px] px-1.5 ml-auto">Retry</Button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Divider */}
            <div style={{ height: '1px', background: 'hsl(var(--border) / 0.5)' }} />

            {/* Paths toggle row */}
            <LayerToggleRow
              label="Flow Paths"
              Icon={Route}
              active={showMovementPaths}
              loading={isLoadingPaths}
              ariaLabel="Toggle flow paths layer"
              tooltip="Visualizes popular routes people are taking between venues. Thicker lines mean more traffic."
              onToggle={() => {
                triggerHaptic('medium');
                const next = !showMovementPaths;
                setShowMovementPaths(next);
                if (next) {
                  schedulePathsRefresh();
                } else {
                  clearPathsRefreshTimer();
                  setIsLoadingPaths(false);
                }
              }}
            />

            {/* Path filters */}
            <div style={{ overflow: 'hidden', transition: 'max-height 0.2s', maxHeight: showMovementPaths ? '200px' : '0px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingLeft: '4px' }}>
                {(isLoadingPaths || pathsError) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px', background: pathsError ? 'hsl(var(--destructive) / 0.1)' : 'hsl(var(--primary) / 0.08)', borderRadius: '8px', fontSize: '10px' }}>
                    {isLoadingPaths ? (
                      <>
                        <Loader2 className="animate-spin" style={{ width: '12px', height: '12px', color: 'hsl(var(--primary))', flexShrink: 0 }} />
                        <span style={{ color: 'hsl(var(--foreground))' }}>Refreshing flow paths...</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle style={{ width: '12px', height: '12px', color: 'hsl(var(--destructive))', flexShrink: 0 }} />
                        <span style={{ color: 'hsl(var(--destructive))' }}>Failed</span>
                        <Button onClick={refreshPaths} variant="ghost" size="sm" className="h-5 text-[9px] px-1.5 ml-auto">Retry</Button>
                      </>
                    )}
                  </div>
                )}
                <Select value={pathTimeFilter} onValueChange={(v: any) => setPathTimeFilter(v)}>
                  <SelectTrigger
                    className="w-full font-display font-semibold rounded-[10px] min-h-0 h-auto map-filter-pill"
                    style={{
                      padding: 'clamp(6px, 1.6vw, 8px) clamp(8px, 2.2vw, 12px)',
                      fontSize: 'clamp(10px, 2.6vw, 12px)',
                      flexDirection: 'row',
                      flexWrap: 'nowrap',
                      border: pathTimeFilter !== 'all'
                        ? '1px solid hsl(var(--primary) / 0.45)'
                        : '1px solid hsl(var(--border) / 0.5)',
                      background: pathTimeFilter !== 'all'
                        ? 'linear-gradient(135deg, hsl(var(--primary) / 0.18), hsl(var(--primary-glow) / 0.14))'
                        : 'hsl(var(--card) / 0.5)',
                      backdropFilter: 'blur(12px) saturate(1.4)',
                      WebkitBackdropFilter: 'blur(12px) saturate(1.4)',
                      boxShadow: pathTimeFilter !== 'all'
                        ? '0 8px 24px -10px hsl(var(--primary) / 0.55), inset 0 0 0 1px hsl(var(--primary-glow) / 0.18)'
                        : 'inset 0 0 0 1px hsl(0 0% 100% / 0.03)',
                      letterSpacing: '-0.005em',
                      color: pathTimeFilter !== 'all' ? 'hsl(var(--foreground))' : undefined,
                      transition: 'background 220ms cubic-bezier(0.16,1,0.3,1), border-color 220ms ease, box-shadow 220ms ease, color 220ms ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(6px, 1.6vw, 10px)', flex: 1, minWidth: 0 }}>
                      <span style={{
                        width: 'clamp(20px, 5.2vw, 24px)', height: 'clamp(20px, 5.2vw, 24px)', borderRadius: '7px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        background: pathTimeFilter !== 'all'
                          ? 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary-glow)))'
                          : 'hsl(var(--background) / 0.6)',
                        border: pathTimeFilter !== 'all'
                          ? '1px solid transparent'
                          : '1px solid hsl(var(--border) / 0.6)',
                        boxShadow: pathTimeFilter !== 'all'
                          ? '0 4px 12px -4px hsl(var(--primary) / 0.6)'
                          : 'none',
                        transition: 'background 220ms ease, border-color 220ms ease, box-shadow 220ms ease',
                      }}>
                        <Clock style={{ width: '12px', height: '12px', color: pathTimeFilter !== 'all' ? 'hsl(var(--primary-foreground))' : 'hsl(var(--muted-foreground))' }} strokeWidth={2.25} />
                      </span>
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>
                        <SelectValue placeholder="Time" />
                      </span>
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Time</SelectItem>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="this_week">This Week</SelectItem>
                    <SelectItem value="this_hour">This Hour</SelectItem>
                  </SelectContent>
                </Select>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '9px' }}>
                    <span style={{ color: 'hsl(var(--muted-foreground))' }}>Min. Frequency</span>
                    <span style={{ fontWeight: 600, color: 'hsl(var(--primary))' }}>{minPathFrequency}</span>
                  </div>
                  <input type="range" min="1" max="10" value={minPathFrequency} onChange={(e) => setMinPathFrequency(parseInt(e.target.value))} className="path-flow-slider w-full" />
                </div>
                {pathData && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '9px', color: 'hsl(var(--muted-foreground))', paddingTop: '4px', borderTop: '1px solid hsl(var(--border) / 0.3)' }}>
                    <span>{pathData.stats.total_paths} paths</span>
                    <span>•</span>
                    <span>{pathData.stats.unique_users} users</span>
                  </div>
                )}
              </div>
            </div>

            {/* Divider */}
            <div style={{ height: '1px', background: 'hsl(var(--border) / 0.5)' }} />

            {/* Parking toggle row */}
            <LayerToggleRow
              label="Parking"
              Icon={Car}
              active={showParking}
              ariaLabel="Toggle parking layer"
              tooltip="Displays nearby parking options around venues so you can plan your arrival."
              onToggle={() => {
                triggerHaptic('medium');
                const newState = !showParking;
                setShowParking(newState);
                if (map.current) {
                  try {
                    if (map.current.getLayer('parking-icons')) {
                      map.current.setLayoutProperty('parking-icons', 'visibility', newState ? 'visible' : 'none');
                    }
                  } catch (e) { /* layer may not exist yet */ }
                }
              }}
            />

            {/* Divider */}
            <div style={{ height: '1px', background: 'hsl(var(--border) / 0.5)' }} />

            {/* Live Stats toggle row */}
            <LayerToggleRow
              label="Live Stats"
              Icon={BarChart3}
              active={showLiveStats}
              loading={isLoadingStats}
              ariaLabel="Toggle live stats panel"
              tooltip="Real-time summary computed from recent user activity: active hotspots, recent check-ins, people on the move, and popular routes."
              onToggle={() => {
                triggerHaptic('medium');
                const next = !showLiveStats;
                setShowLiveStats(next);
                if (next) setIsLoadingStats(true);
                else setIsLoadingStats(false);
              }}
            />

            {/* Open Now filter — hides venues currently marked Closed */}
            <LayerToggleRow
              label="Open Now"
              Icon={CircleDot}
              active={openNowOnly}
              ariaLabel="Show only venues that are open now"
              tooltip="Hides venues currently marked Closed based on their business hours. Venues with unknown hours stay visible."
              onToggle={() => {
                triggerHaptic('medium');
                setOpenNowOnly((v) => !v);
              }}
            />

            {/* Inline Live Stats — consolidated within the Layers panel for friendlier usability */}
            {showLiveStats && (
              <div
                style={{
                  marginTop: '6px',
                  padding: 'var(--live-stats-pad)',
                  borderRadius: '10px',
                  border: '1px solid hsl(var(--primary) / 0.25)',
                  background: 'linear-gradient(135deg, hsl(var(--primary) / 0.08), hsl(var(--primary-glow) / 0.04))',
                  animation: 'fadeIn 220ms ease-out',
                  overflow: 'hidden',
                }}
              >
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
                  variant="inline"
                />
              </div>
            )}

            {/* Reset to defaults */}
            <button
              type="button"
              onClick={handleResetToDefaults}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '6px 8px',
                borderRadius: '8px',
                border: '1px solid hsl(var(--border) / 0.4)',
                background: 'transparent',
                color: 'hsl(var(--muted-foreground))',
                fontSize: '10px',
                fontWeight: 600,
                letterSpacing: '0.02em',
                cursor: 'pointer',
                transition: 'color 200ms ease, border-color 200ms ease, background 200ms ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'hsl(var(--foreground))';
                e.currentTarget.style.borderColor = 'hsl(var(--border) / 0.7)';
                e.currentTarget.style.background = 'hsl(var(--card) / 0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'hsl(var(--muted-foreground))';
                e.currentTarget.style.borderColor = 'hsl(var(--border) / 0.4)';
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <RotateCcw style={{ width: '12px', height: '12px' }} />
              Reset to defaults
            </button>

          </div>
        </div>

        {/* Active layer icon chips — visible when panel is collapsed */}
        {controlsCollapsed && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginBottom: '8px',
            justifyContent: 'flex-end',
          }}>
            {showDensityLayer && (
              <div style={{
                width: '28px', height: '28px',
                borderRadius: '8px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'hsl(var(--primary))',
                color: 'hsl(var(--primary-foreground))',
                boxShadow: '0 4px 12px -2px hsl(var(--primary) / 0.4)',
              }}>
                <Layers style={{ width: '14px', height: '14px' }} />
              </div>
            )}
            {showMovementPaths && (
              <div style={{
                width: '28px', height: '28px',
                borderRadius: '8px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'hsl(var(--primary))',
                color: 'hsl(var(--primary-foreground))',
                boxShadow: '0 4px 12px -2px hsl(var(--primary) / 0.4)',
              }}>
                <Route style={{ width: '14px', height: '14px' }} />
              </div>
            )}
            {showParking && (
              <div style={{
                width: '28px', height: '28px',
                borderRadius: '8px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'hsl(var(--primary))',
                color: 'hsl(var(--primary-foreground))',
                boxShadow: '0 4px 12px -2px hsl(var(--primary) / 0.4)',
              }}>
                <Car style={{ width: '14px', height: '14px' }} />
              </div>
            )}
            {showLiveStats && (
              <div style={{
                width: '28px', height: '28px',
                borderRadius: '8px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'hsl(var(--primary))',
                color: 'hsl(var(--primary-foreground))',
                boxShadow: '0 4px 12px -2px hsl(var(--primary) / 0.4)',
              }}>
                <BarChart3 style={{ width: '14px', height: '14px' }} />
              </div>
            )}
          </div>
        )}

        {/* Layers FAB */}
        <button
          onClick={() => { triggerHaptic('light'); setControlsCollapsed(!controlsCollapsed); }}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '12px',
            boxShadow: (showDensityLayer || showMovementPaths || showParking)
              ? '0 20px 25px -5px hsl(var(--primary) / 0.4)'
              : '0 20px 25px -5px rgba(0,0,0,0.1)',
            transition: 'all 0.2s',
            width: 'var(--touch-target-min, 44px)',
            height: 'var(--touch-target-min, 44px)',
            marginLeft: 'auto',
            cursor: 'pointer',
            position: 'relative',
            border: (showDensityLayer || showMovementPaths || showParking) ? 'none' : '1px solid hsl(var(--border))',
            background: (showDensityLayer || showMovementPaths || showParking) ? 'hsl(var(--primary))' : 'hsl(var(--card))',
            color: (showDensityLayer || showMovementPaths || showParking) ? 'hsl(var(--primary-foreground))' : 'hsl(var(--foreground))',
            backdropFilter: (showDensityLayer || showMovementPaths || showParking) ? 'none' : 'blur(24px) saturate(1.6)',
            WebkitBackdropFilter: (showDensityLayer || showMovementPaths || showParking) ? 'none' : 'blur(24px) saturate(1.6)',
          }}
          aria-label={controlsCollapsed ? "Open layers panel" : "Close layers panel"}
        >
          {controlsCollapsed ? (
            <Layers style={{ width: '20px', height: '20px' }} />
          ) : (
            <X style={{ width: '20px', height: '20px' }} />
          )}
        </button>
      </div>
      )}



      {/* Floating Live Stats summary — only when the Layers panel is collapsed,
          so users still see live activity without re-opening the panel. */}
      {controlsCollapsed && (
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
        />
      )}

      {/* Enhanced Legend - Bottom left, responsive for all devices, collapsible on mobile */}
      {/* CRITICAL: Uses only opacity transition to avoid CLS - no translate animations */}
      <div 
        style={{
          position: 'absolute',
          bottom: 'var(--map-fixed-bottom)',
          left: 'var(--map-ui-inset-left)',
          maxWidth: 'var(--map-control-max-width)',
          width: 'clamp(160px, 38vw, 240px)',
          zIndex: 30,
          // Dark luxe legend — vertical gradient surface, hairline border,
          // soft ambient gold glow, inset highlight for refined depth.
          background:
            'linear-gradient(180deg, hsl(var(--card) / 0.95), hsl(var(--card) / 0.82))',
          backdropFilter: 'blur(24px) saturate(1.6)',
          WebkitBackdropFilter: 'blur(24px) saturate(1.6)',
          borderRadius: '12px',
          border: '1px solid hsl(0 0% 100% / 0.06)',
          boxShadow:
            '0 0 60px hsl(var(--gold) / 0.06), 0 14px 30px -12px rgba(0,0,0,0.7), inset 0 1px 0 hsl(0 0% 100% / 0.05)',
          padding: isMobile ? '6px 8px' : '8px 12px',
          opacity: mapLoaded && (isMobile ? !selectedVenue : true) ? 1 : 0,
          visibility: mapLoaded && (isMobile ? !selectedVenue : true) ? 'visible' : 'hidden',
          transition: 'opacity 300ms ease-out, visibility 300ms ease-out',
          transform: 'translateZ(0)',
          willChange: 'opacity',
          pointerEvents: mapLoaded && (isMobile ? !selectedVenue : true) ? 'auto' : 'none',
          cursor: isMobile ? 'pointer' : undefined,
        }}
        onClick={isMobile ? () => { triggerHaptic('light'); setLegendCollapsed(!legendCollapsed); } : undefined}
      >
        {isMobile && legendCollapsed ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <span
              style={{
                fontSize: '9px',
                fontWeight: 500,
                color: 'hsl(var(--gold))',
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
              }}
            >
              Legend
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'hsl(0, 100%, 65%)' }} />
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'hsl(45, 100%, 60%)' }} />
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'hsl(200, 100%, 65%)' }} />
            </div>
            <ChevronUp style={{ width: '12px', height: '12px', color: 'hsl(var(--silver))' }} />
          </div>
        ) : (
          <>
            {isMobile && (
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '4px', cursor: 'pointer' }}>
                <ChevronDown style={{ width: '12px', height: '12px', color: 'hsl(var(--silver))' }} />
              </div>
            )}
            
            {showMovementPaths ? (
              <>
                <p
                  style={{
                    fontSize: '10px',
                    fontWeight: 600,
                    color: 'hsl(var(--gold))',
                    marginBottom: '6px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    textAlign: 'center',
                    width: '100%',
                  }}
                >
                  User Flow Paths
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
                  <div style={{
                    width: '100%', minWidth: 0, height: '14px', borderRadius: '6px',
                    background: 'linear-gradient(to right, rgb(100, 200, 255), rgb(0, 255, 255), rgb(255, 200, 0), rgb(255, 100, 0), rgb(255, 0, 100))',
                    border: '1px solid hsl(var(--gold) / 0.35)',
                    boxShadow:
                      'inset 0 1px 3px rgba(0,0,0,0.3), 0 0 12px hsl(var(--gold) / 0.15)',
                  }} />
                  <div style={{ display: 'flex', width: '100%', fontSize: '9px', color: 'hsl(var(--muted-foreground))', fontWeight: 500 }}>
                    <span style={{ flex: 1, textAlign: 'center' }}>Low</span>
                    <span style={{ flex: 1, textAlign: 'center' }}>Medium</span>
                    <span style={{ flex: 1, textAlign: 'center' }}>High</span>
                  </div>
                </div>
              </>
            ) : showDensityLayer ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginBottom: '6px' }}>
                  <p
                    style={{
                      fontSize: '10px',
                      fontWeight: 600,
                      color: 'hsl(var(--gold))',
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      textAlign: 'center',
                    }}
                  >
                    {timelapseMode ? 'Time-lapse' : 'User Density Heatmap'}
                  </p>
                  {timelapseMode && timelapse.isPlaying && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <div className="animate-pulse" style={{ width: '6px', height: '6px', background: 'hsl(var(--primary))', borderRadius: '50%' }} />
                      <span style={{ fontSize: '9px', color: 'hsl(var(--primary))', fontWeight: 500 }}>{timelapse.formatHour(timelapse.currentHour)}</span>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
                  <div style={{
                    width: '100%', minWidth: 0, height: '14px', borderRadius: '6px',
                    background: 'linear-gradient(to right, rgba(65, 105, 225, 0.8), rgb(0, 255, 127), rgb(255, 255, 0), rgb(255, 165, 0), rgb(255, 0, 0), rgb(139, 0, 0))',
                    border: '1px solid hsl(var(--gold) / 0.35)',
                    boxShadow:
                      'inset 0 1px 3px rgba(0,0,0,0.3), 0 0 12px hsl(var(--gold) / 0.15)',
                  }} />
                  <div style={{ display: 'flex', width: '100%', fontSize: '9px', color: 'hsl(var(--muted-foreground))', fontWeight: 500 }}>
                    <span style={{ flex: 1, textAlign: 'center' }}>Low</span>
                    <span style={{ flex: 1, textAlign: 'center' }}>Medium</span>
                    <span style={{ flex: 1, textAlign: 'center' }}>High</span>
                  </div>
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <p
                  style={{
                    fontSize: '9px',
                    fontWeight: 600,
                    color: 'hsl(var(--gold))',
                    marginBottom: '4px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.12em',
                    textAlign: 'center',
                    width: '100%',
                  }}
                >
                  Activity
                </p>
                <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? '4px' : '8px', width: '100%', justifyContent: 'center', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', flex: isMobile ? 'none' : 1 }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'hsl(0, 100%, 65%)', boxShadow: '0 0 6px hsl(0, 100%, 65% / 0.6)' }} />
                    <span style={{ fontSize: '9px', color: 'hsl(var(--foreground))' }}>Hot</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', flex: isMobile ? 'none' : 1 }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'hsl(var(--gold))', boxShadow: '0 0 6px hsl(var(--gold) / 0.55)' }} />
                    <span style={{ fontSize: '9px', color: 'hsl(var(--foreground))' }}>Warm</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', flex: isMobile ? 'none' : 1 }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'hsl(var(--silver))', boxShadow: '0 0 6px hsl(var(--silver) / 0.5)' }} />
                    <span style={{ fontSize: '9px', color: 'hsl(var(--foreground))' }}>Cool</span>
                  </div>
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
