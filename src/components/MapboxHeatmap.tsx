import { useEffect, useRef, useState, useCallback } from "react";
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
import { MapPin, TrendingUp, Layers, X, AlertCircle, Route, Play, Pause, SkipBack, SkipForward, Clock, ChevronDown, ChevronUp, PanelRightClose, PanelRightOpen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLocationDensity } from "@/hooks/useLocationDensity";
import { useMovementPaths } from "@/hooks/useMovementPaths";
import { useHeatmapTimelapse } from "@/hooks/useHeatmapTimelapse";
import { useIsMobile } from "@/hooks/use-mobile";
import { triggerHaptic } from "@/lib/haptics";
import { Button } from "./ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Slider } from "./ui/slider";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";

import { CITIES, type City, getDistanceKm, getNearestCity, getCitiesSortedByDistance, kmToMiles } from "@/types/cities";
import { getCachedReverseGeocode, type GeocodedLocation } from "@/utils/reverseGeocode";
import locationPuckIcon from "@/assets/location-puck.png";

// Re-export Venue type for backwards compatibility
export type { Venue } from "@/types/venue";
import type { Venue } from "@/types/venue";

interface MapboxHeatmapProps {
  onVenueSelect: (venue: Venue) => void;
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

// Get glow color for markers based on activity
const getActivityGlow = (activity: number) => {
  if (activity >= 80) return "rgba(255, 100, 100, 0.6)"; // red glow
  if (activity >= 60) return "rgba(255, 200, 50, 0.5)"; // warm glow
  return "rgba(100, 180, 255, 0.5)"; // blue glow
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

export const MapboxHeatmap = ({ onVenueSelect, venues, mapboxToken, selectedCity, onCityChange, onNearestCityDetected, onDetectedLocationNameChange, isLoadingVenues = false, selectedVenue, resetUIKey, isTokenLoading = false }: MapboxHeatmapProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<MapboxGL.Map | null>(null);
  const mapboxglRef = useRef<MapboxGLModule | null>(null);
  const [mapboxLoaded, setMapboxLoaded] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapInitializing, setMapInitializing] = useState(true);
  const [tileProgress, setTileProgress] = useState(0);
  const [mapError, setMapError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const userMarker = useRef<MapboxGL.Marker | null>(null);
  const markersRef = useRef<MapboxGL.Marker[]>([]);
  const dealMarkersRef = useRef<MapboxGL.Marker[]>([]);
  const geolocateControlRef = useRef<MapboxGL.GeolocateControl | null>(null);
  const flowAnimationRef = useRef<number | null>(null);
  const isMobile = useIsMobile();
  const initStartTime = useRef<number>(0);
  const platformSettings = useRef(getPlatformSettings(isMobile));
  
  // Load mapbox-gl module on mount (deferred to reduce TBT)
  useEffect(() => {
    let mounted = true;
    loadMapboxGL().then((mapboxgl) => {
      if (mounted) {
        mapboxglRef.current = mapboxgl;
        setMapboxLoaded(true);
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
  
  // Density heatmap state
  const [showDensityLayer, setShowDensityLayer] = useState(false);
  const [timeFilter, setTimeFilter] = useState<'all' | 'today' | 'this_week' | 'this_hour'>('all');
  const [hourFilter, setHourFilter] = useState<number | undefined>();
  const [dayFilter, setDayFilter] = useState<number | undefined>();
  // Auto-detect time of day based on local time
  const getTimeOfDayPreset = (): 'dawn' | 'day' | 'dusk' | 'night' => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 8) return 'dawn';
    if (hour >= 8 && hour < 17) return 'day';
    if (hour >= 17 && hour < 20) return 'dusk';
    return 'night';
  };
  
  const [mapStyle, setMapStyle] = useState<'light' | 'dark' | 'streets' | 'satellite'>('dark');
  const [lightPreset, setLightPreset] = useState<'dawn' | 'day' | 'dusk' | 'night'>(getTimeOfDayPreset);
  const [show3DTerrain, setShow3DTerrain] = useState(false);
  
  // Time-lapse mode state
  const [timelapseMode, setTimelapseMode] = useState(false);
  
  // Movement paths state
  const [showMovementPaths, setShowMovementPaths] = useState(false);
  const [pathTimeFilter, setPathTimeFilter] = useState<'all' | 'today' | 'this_week' | 'this_hour'>('all');
  
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
  const [isUsingCurrentLocation, setIsUsingCurrentLocation] = useState(true); // Default to current location
  
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
  
  // Time-lapse hook
  const timelapse = useHeatmapTimelapse(dayFilter);

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
          style: 'mapbox://styles/mapbox/dark-v11',
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

        // Add geolocate control with location change handler
        const geolocateControl = new mapboxgl.GeolocateControl({
          positionOptions: {
            enableHighAccuracy: true,
          },
          trackUserLocation: true,
          showUserHeading: true,
          showUserLocation: false, // Hide default marker, we'll use custom
        });
        
        geolocateControlRef.current = geolocateControl;
        map.current.addControl(geolocateControl, "top-right");
        
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
        
        // Listen for geolocate events to update city and marker
        geolocateControl.on('geolocate', async (e: any) => {
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
        geolocateControl.on('trackuserlocationend', () => {
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
          }
        };

        // Ensure map resizes to container after initialization
        map.current.on('load', () => {
          const loadTime = performance.now() - initStartTime.current;
          console.log(`MapboxHeatmap: Map loaded successfully in ${loadTime.toFixed(2)}ms`);
          
          // Finalize immediately for fastest LCP
          finalizeMapLoad();
          
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

        // Track tile loading progress
        let tilesLoading = 0;
        let tilesLoaded = 0;
        
        const updateProgress = () => {
          if (tilesLoading === 0) {
            setTileProgress(100);
          } else {
            const progress = Math.min(95, Math.round((tilesLoaded / tilesLoading) * 100));
            setTileProgress(progress);
          }
        };
        
        map.current.on('dataloading', (e) => {
          if (e.dataType === 'source' && e.tile) {
            tilesLoading++;
            updateProgress();
          }
        });
        
        map.current.on('data', (e) => {
          if (e.dataType === 'source' && e.tile) {
            tilesLoaded++;
            updateProgress();
          }
        });
        
        map.current.on('idle', () => {
          setTileProgress(100);
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
                console.error('MapboxHeatmap: Map load timeout - checking WebGL support');
                // Check for WebGL support
                const canvas = document.createElement('canvas');
                const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
                if (!gl) {
                  setMapError('WebGL is not supported or disabled. Please enable it in your browser settings.');
                } else {
                  setMapError(
                    'Map loading timed out. If this only happens on production, check your Mapbox token URL restrictions.'
                  );
                }
                setMapInitializing(false);
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

    // Initialize map immediately using queueMicrotask for fastest startup
    // This ensures we start init on the next microtask without blocking the current frame
    queueMicrotask(initializeMap);
    
    return () => {
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

    // Add enhanced heatmap layer with glow effect
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
          0, 2,
          9, 3,
          15, 5,
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
        // Adaptive radius for better visualization at all zoom levels
        'heatmap-radius': [
          'interpolate',
          ['exponential', 1.8],
          ['zoom'],
          0, 20,
          9, 50,
          12, 70,
          15, 100,
        ],
        // Smooth opacity curve for better blending
        'heatmap-opacity': [
          'interpolate',
          ['linear'],
          ['zoom'],
          7, 0.95,
          12, 0.9,
          15, 0.85,
        ],
        'heatmap-opacity-transition': {
          duration: 1000,
          delay: 0
        }
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
  }, [mapLoaded, densityData, showDensityLayer, timelapseMode, timelapse.currentData, timelapse.currentHour]);

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
      // Remove existing layers and source if they exist - check style is loaded first
      if (map.current?.style?.loaded()) {
        [particleLayerId, arrowLayerId, glowLayerId, lineLayerId].forEach(id => {
          if (map.current?.getLayer(id)) {
            map.current.removeLayer(id);
          }
        });
        if (map.current?.getSource(sourceId)) {
          map.current.removeSource(sourceId);
        }
        if (map.current?.getSource(`${sourceId}-particles`)) {
          map.current.removeSource(`${sourceId}-particles`);
        }
      }
    } catch (error) {
      console.error('Error removing existing movement path layers:', error);
      return;
    }

    if (!showMovementPaths) return;

    // Add movement paths source
    map.current.addSource(sourceId, {
      type: 'geojson',
      data: pathData.geojson,
      lineMetrics: true,
    });

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


  // Skeleton marker positions (static positions around the city center for loading state)
  const skeletonMarkerPositions = [
    { lat: selectedCity.lat + 0.008, lng: selectedCity.lng - 0.012 },
    { lat: selectedCity.lat - 0.005, lng: selectedCity.lng + 0.015 },
    { lat: selectedCity.lat + 0.012, lng: selectedCity.lng + 0.008 },
    { lat: selectedCity.lat - 0.010, lng: selectedCity.lng - 0.006 },
    { lat: selectedCity.lat + 0.003, lng: selectedCity.lng - 0.018 },
    { lat: selectedCity.lat - 0.015, lng: selectedCity.lng + 0.003 },
  ];

  // Optimized marker updates with throttling
  const updateMarkers = () => {
    if (!map.current || !mapLoaded) return;

    const mapInstance = map.current;
    
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

    // Show skeleton markers while loading
    if (isLoadingVenues && venues.length === 0) {
      skeletonMarkerPositions.forEach((pos, index) => {
        if (!mapInstance) return;
        
        const el = document.createElement("div");
        el.className = "venue-marker-skeleton";
        el.style.cssText = `
          width: ${baseSize}px;
          height: ${baseSize * 1.4}px;
          position: relative;
        `;

        const pinEl = document.createElement('div');
        pinEl.style.cssText = `
          width: ${baseSize}px;
          height: ${baseSize}px;
          background: linear-gradient(90deg, 
            hsl(var(--muted)) 0%, 
            hsl(var(--muted-foreground) / 0.3) 50%, 
            hsl(var(--muted)) 100%
          );
          background-size: 200% 100%;
          animation: shimmer 1.5s ease-in-out infinite;
          animation-delay: ${index * 150}ms;
          border: 2px solid hsl(var(--border) / 0.5);
          border-radius: 50% 50% 50% 0;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
          transform: rotate(-45deg);
          position: absolute;
          top: 0;
          left: 50%;
          margin-left: -${baseSize / 2}px;
          opacity: 0.7;
        `;

        el.appendChild(pinEl);

        if (!mapboxglRef.current) return;
        const marker = new mapboxglRef.current.Marker({ element: el })
          .setLngLat([pos.lng, pos.lat])
          .addTo(mapInstance);

        markersRef.current.push(marker);
      });
      return;
    }

    // Calculate distances between venues to detect clusters
    const getDistance = (lat1: number, lng1: number, lat2: number, lng2: number) => {
      return Math.sqrt(Math.pow(lat2 - lat1, 2) + Math.pow(lng2 - lng1, 2));
    };

    // Add venue markers
    venues.forEach((venue, index) => {
      // Guard against map becoming null during iteration
      if (!mapInstance) return;
      
      const color = getActivityColor(venue.activity);

      // Check proximity to other venues
      let nearbyCount = 0;
      venues.forEach((otherVenue, otherIndex) => {
        if (index !== otherIndex) {
          const distance = getDistance(venue.lat, venue.lng, otherVenue.lat, otherVenue.lng);
          if (distance < 0.001) nearbyCount++; // Very close proximity
        }
      });

      // Adjust size based on proximity - slightly smaller for clustered areas
      const proximityFactor = nearbyCount > 0 ? Math.max(0.85, 1 - (nearbyCount * 0.04)) : 1;
      const activitySizeFactor = venue.activity >= 80 ? 1.15 : venue.activity >= 60 ? 1.08 : 1;
      // Increased minimum size for better visibility
      const markerSize = Math.max(32, Math.min(38, baseSize * 0.8)) * proximityFactor * activitySizeFactor;
      const markerHeight = markerSize * 1.35;
      const glowColor = getActivityGlow(venue.activity);

      // Create teardrop marker element with entrance animation
      const staggerDelay = (index % 30) * 30;
      const el = document.createElement("div");
      el.className = "venue-marker";
      el.style.cssText = `
        display: flex;
        flex-direction: column;
        align-items: center;
        cursor: pointer;
        will-change: opacity;
        opacity: 0;
        animation: markerFadeIn 0.4s ease-out ${staggerDelay}ms forwards;
        background: transparent;
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
      `;

      // Create animated gradient ring (behind teardrop) - with activity-based color
      // Only animate if not in low power/reduced motion mode
      const ringEl = document.createElement('div');
      const ringSize = markerSize + 10;
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
        border: 2px solid ${color};
        opacity: ${pulseOpacity};
        ${shouldAnimate ? `animation: markerRingPulse ${pulseSpeed} ease-in-out infinite;` : ''}
      `;

      // Create teardrop shape - simplified without backdrop-filter to avoid rendering artifacts
      const teardropEl = document.createElement('div');
      const isDarkTheme = document.documentElement.classList.contains('dark');
      teardropEl.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: ${markerSize}px;
        height: ${markerSize}px;
        background: ${isDarkTheme 
          ? 'linear-gradient(145deg, #3a3a45, #25252d)' 
          : 'linear-gradient(145deg, #ffffff, #f0f0f5)'};
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        transform-origin: center center;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 2px solid ${color};
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      `;
      
      // Add inner icon/dot to indicate activity level
      const innerDot = document.createElement('div');
      const dotSize = markerSize * 0.35;
      innerDot.style.cssText = `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) rotate(45deg);
        width: ${dotSize}px;
        height: ${dotSize}px;
        border-radius: 50%;
        background: ${color};
      `;
      teardropEl.appendChild(innerDot);

      pinEl.appendChild(ringEl);
      pinEl.appendChild(teardropEl);
      el.appendChild(pinEl);

      // Hover effects - scale and enhanced shadow
      el.addEventListener("mouseenter", () => {
        el.style.zIndex = "100";
        pinEl.style.transform = "scale(1.15)";
        teardropEl.style.boxShadow = `0 6px 16px rgba(0, 0, 0, 0.4)`;
        ringEl.style.opacity = '1';
      });

      el.addEventListener("mouseleave", () => {
        el.style.zIndex = "";
        pinEl.style.transform = "scale(1)";
        teardropEl.style.boxShadow = `0 4px 12px rgba(0, 0, 0, 0.3)`;
        ringEl.style.opacity = pulseOpacity;
      });

      // Create marker with bottom anchor for teardrop (pin point at GPS location)
      if (!mapboxglRef.current) return;
      const marker = new mapboxglRef.current.Marker({
        element: el,
        anchor: 'bottom'
      })
        .setLngLat([venue.lng, venue.lat])
        .addTo(mapInstance);

      // Create popup for the venue with enhanced information
      const addressHTML = venue.address 
        ? `<p style="margin: 4px 0 8px 0; font-size: ${isMobile ? '11px' : '12px'}; color: rgba(255, 255, 255, 0.65); line-height: 1.4;">${venue.address}</p>`
        : '';
        
      const googleRatingHTML = venue.googleRating 
        ? `<div style="display: flex; align-items: center; gap: 6px; margin-top: 8px;">
             <span style="color: #FFD700; font-size: ${isMobile ? '14px' : '16px'};">★</span>
             <span style="font-size: ${isMobile ? '13px' : '14px'}; font-weight: 700; color: white;">${venue.googleRating.toFixed(1)}</span>
             <span style="font-size: ${isMobile ? '11px' : '12px'}; color: rgba(255, 255, 255, 0.6);">(${venue.googleTotalRatings?.toLocaleString() || 0} reviews)</span>
           </div>`
        : '';
      
      const isOpenHTML = venue.isOpen !== null && venue.isOpen !== undefined
        ? `<div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255, 255, 255, 0.12);">
             <span style="display: inline-flex; align-items: center; gap: 6px;">
               <span style="display: inline-block; width: ${isMobile ? '10px' : '12px'}; height: ${isMobile ? '10px' : '12px'}; border-radius: 50%; background: ${venue.isOpen ? '#22c55e' : '#ef4444'}; box-shadow: 0 0 8px ${venue.isOpen ? '#22c55e' : '#ef4444'};"></span>
               <span style="font-size: ${isMobile ? '12px' : '14px'}; font-weight: 700; color: ${venue.isOpen ? '#22c55e' : '#ef4444'};">${venue.isOpen ? 'Open Now' : 'Closed'}</span>
             </span>
           </div>`
        : '';

      const popup = new mapboxglRef.current.Popup({
        offset: isMobile ? 20 : 28,
        closeButton: true,
        closeOnClick: true,
        maxWidth: isMobile ? '280px' : '320px',
        className: 'venue-popup'
      }).setHTML(`
        <div style="padding: ${isMobile ? '12px' : '16px'};">
          <h4 style="margin: 0 0 6px 0; font-size: ${isMobile ? '15px' : '17px'}; font-weight: 700; color: white; line-height: 1.3;">${venue.name}</h4>
          <p style="margin: 0 0 8px 0; font-size: ${isMobile ? '12px' : '13px'}; color: rgba(255, 255, 255, 0.75); font-weight: 500;">${venue.category}</p>
          ${addressHTML}
          <div style="display: flex; align-items: center; gap: 6px; margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255, 255, 255, 0.1);">
            <div style="width: ${isMobile ? '10px' : '12px'}; height: ${isMobile ? '10px' : '12px'}; border-radius: 50%; background: ${color}; box-shadow: 0 0 8px ${color};"></div>
            <span style="font-size: ${isMobile ? '12px' : '14px'}; font-weight: 700; color: white;">${venue.activity}% Active</span>
          </div>
          ${googleRatingHTML}
          ${isOpenHTML}
        </div>
      `);

      // Attach popup to marker
      marker.setPopup(popup);

      // Handle click on the marker element
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        
        // Haptic feedback for venue selection
        triggerHaptic('medium');
        
        // Open venue card
        onVenueSelect(venue);
        
        // Show popup
        popup.addTo(mapInstance);
      });

      markersRef.current.push(marker);
    });
    
    }); // Close requestAnimationFrame
  };

  // Call updateMarkers on initial load and when venues change
  useEffect(() => {
    updateMarkers();
  }, [venues, mapLoaded, isLoadingVenues, selectedCity]);

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
              8, 0.6,
              12, 1,
              15, 1.5
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
              ['linear'],
              ['zoom'],
              8, 30,
              12, 20,
              15, 10
            ],
            // Fade out opacity as zoom increases (individual markers take over)
            'heatmap-opacity': [
              'interpolate',
              ['linear'],
              ['zoom'],
              10, 0.8,
              13, 0.4,
              15, 0
            ]
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
  }, [venues, mapLoaded]);

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
        // Match parent container exactly to prevent CLS
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        minHeight: '100%',
        contain: 'strict',
        isolation: 'isolate',
      }}
    >
      {/* Map loads directly - no placeholder overlay */}

      {/* Map Error State with Retry - deferred to not become LCP element */}
      {mapError && !mapInitializing && (
        <div 
          className="absolute inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm"
          style={{ contentVisibility: 'auto' }}
        >
          <div className="flex flex-col items-center gap-4 p-6 max-w-sm text-center">
            <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center">
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
                  setTileProgress(0);
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
          // Fixed dimensions prevent 0.0655 CLS when Mapbox canvas loads
          minWidth: '100%',
          minHeight: '100%',
          touchAction: isMobile ? 'manipulation' : 'none',
          WebkitOverflowScrolling: 'touch',
          contain: 'strict',
          // GPU acceleration for smooth canvas insertion
          transform: 'translateZ(0)',
          willChange: 'contents',
        }}
      />

      {/* City Selector with Current Location option - responsive for all devices */}
      {/* City Selector - CLS fix: Defer render until after initial paint */}
      {controlsReady && (
      <div 
        className="absolute z-10"
        style={{
          top: 'var(--map-ui-inset-top)',
          left: 'var(--map-ui-inset-left)',
          // CLS fix: Fixed dimensions prevent layout shift when "Locating..." changes
          width: '172px',
          height: '36px',
          minWidth: '172px',
          minHeight: '36px',
          maxWidth: '172px',
          maxHeight: '36px',
          contain: 'strict',
          overflow: 'hidden',
        }}
      >
        <Select
          value={isUsingCurrentLocation ? "current-location" : selectedCity.id}
          onValueChange={(value) => {
            // Haptic feedback for city selection
            triggerHaptic('light');
            
            if (value === "current-location") {
              setIsUsingCurrentLocation(true);
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
            className="w-auto text-[10px] sm:text-xs md:text-sm lg:text-base h-9 sm:h-10 md:h-11 lg:h-12 px-2.5 sm:px-3 md:px-4 rounded-xl shadow-lg bg-card/95 backdrop-blur-xl border-border"
            aria-label="Select city location"
            style={{
              // CLS fix: Reserve stable width to prevent layout shift when "Locating..." changes to city name
              minWidth: '160px',
              contain: 'layout style',
            }}
          >
            <div className="flex items-center gap-1.5 sm:gap-2 md:gap-2.5">
              <MapPin className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 text-primary flex-shrink-0" />
              <span 
                className="font-semibold truncate"
                style={{
                  // CLS fix: Fixed width prevents layout shift when text content changes
                  width: '110px',
                  minWidth: '110px',
                  maxWidth: '110px',
                }}
              >
                {isUsingCurrentLocation 
                  ? (detectedLocationName || (detectedCity ? `${detectedCity.name}, ${detectedCity.state}` : "Locating..."))
                  : `${selectedCity.name}, ${selectedCity.state}`}
              </span>
              {isUsingCurrentLocation && (detectedLocationName || detectedCity) && (
                <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 bg-primary rounded-full animate-pulse" />
              )}
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="current-location">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                {detectedLocationName 
                  ? `${detectedLocationName} (Current)` 
                  : (detectedCity ? `${detectedCity.name}, ${detectedCity.state} (Current)` : "Use Current Location")}
              </div>
            </SelectItem>
            <div className="h-px bg-border my-1" />
            {(userLocation 
              ? getCitiesSortedByDistance(userLocation.lat, userLocation.lng)
              : CITIES.map(c => ({ ...c, distanceKm: 0 }))
            ).map((city) => {
              const distanceMiles = userLocation ? kmToMiles(city.distanceKm) : null;
              return (
                <SelectItem key={city.id} value={city.id}>
                  <div className="flex items-center justify-between w-full gap-3">
                    <span>{city.name}, {city.state}</span>
                    {distanceMiles !== null && (
                      <span className="text-xs text-muted-foreground">
                        {distanceMiles < 1 ? '<1' : Math.round(distanceMiles)} mi
                      </span>
                    )}
                  </div>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>
      )}

      {/* Map Controls - Top left below city selector */}
      {/* CLS fix: Defer render until after initial paint to prevent layout shifts */}
      {controlsReady && (
      <div 
        className="absolute z-10 space-y-2 sm:space-y-2.5 md:space-y-3"
        style={{
          top: isMobile ? 'calc(var(--map-ui-inset-top) + 3.5rem)' : 'calc(var(--map-ui-inset-top) + 4rem)',
          left: 'var(--map-ui-inset-left)',
          maxWidth: isMobile ? 'calc(50vw - 0.75rem)' : 'var(--map-control-max-width)',
          contain: 'layout style',
        }}
      >
        <Collapsible defaultOpen={false}>
          <CollapsibleTrigger asChild>
            <Button
              variant="secondary"
              size="sm"
              className="bg-card/95 backdrop-blur-xl border border-border text-[10px] sm:text-xs md:text-sm shadow-lg h-9 sm:h-10 md:h-11 px-2.5 sm:px-3 md:px-4 rounded-xl transition-all duration-200"
              aria-label="Toggle map style options"
            >
              <Layers className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 mr-1 sm:mr-1.5" aria-hidden="true" />
              <span>Map Style</span>
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 sm:mt-2.5 overflow-hidden data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up">
            <div className="bg-card/95 backdrop-blur-xl rounded-xl border border-border p-2 sm:p-2.5 md:p-3 shadow-lg space-y-2.5 sm:space-y-3">
              {/* Map Style Options */}
              <div className="space-y-1.5" role="group" aria-label="Map base style options">
                <span id="base-style-label" className="text-[9px] sm:text-[10px] md:text-xs text-muted-foreground font-medium uppercase tracking-wider">Base Style</span>
                <div className="grid grid-cols-4 gap-1.5 sm:gap-2" role="radiogroup" aria-labelledby="base-style-label">
                  {(['light', 'dark', 'streets', 'satellite'] as const).map((style) => (
                    <Button
                      key={style}
                      onClick={() => { triggerHaptic('light'); setMapStyle(style); }}
                      variant={mapStyle === style ? "default" : "outline"}
                      size="sm"
                      className="h-7 sm:h-8 md:h-9 text-[9px] sm:text-[10px] md:text-xs px-1.5 sm:px-2 capitalize"
                      aria-label={`Set map style to ${style}`}
                      aria-pressed={mapStyle === style}
                    >
                      {style}
                    </Button>
                  ))}
                </div>
              </div>
              
              {/* 3D Terrain Toggle */}
              <Button
                onClick={() => { triggerHaptic('medium'); setShow3DTerrain(!show3DTerrain); }}
                variant={show3DTerrain ? "default" : "outline"}
                size="sm"
                className="w-full h-8 sm:h-9 md:h-10 text-[10px] sm:text-xs md:text-sm"
                aria-label={show3DTerrain ? "Disable 3D terrain view" : "Enable 3D terrain view"}
                aria-pressed={show3DTerrain}
              >
                {show3DTerrain ? "Disable" : "Enable"} 3D Terrain
              </Button>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
      )}

      {/* CLS fix: Only render layer controls after initial paint to prevent layout shifts */}
      {controlsReady && (
      <div 
        className="fixed z-[60] flex flex-col-reverse gap-2 sm:gap-2.5"
        style={{
          bottom: 'var(--map-fixed-bottom)',
          right: 'var(--map-ui-inset-right)',
          // CLS fix: Fixed width prevents layout shifts when controls render
          width: '140px',
          minWidth: '140px',
          maxWidth: '140px',
          // Strict containment prevents any layout shifts from propagating
          contain: 'strict',
          opacity: !selectedVenue ? 1 : 0,
          pointerEvents: !selectedVenue ? 'auto' : 'none',
          transform: 'translateZ(0)',
        }}
      >
          {/* Paths Button - appears below Heat visually due to flex-col-reverse */}
          <Button
            onClick={() => { triggerHaptic('medium'); setShowMovementPaths(!showMovementPaths); }}
            variant={showMovementPaths ? "default" : "outline"}
            size="sm"
            className={`w-full h-12 text-sm font-semibold rounded-xl shadow-lg transition-all duration-200 active:scale-95 touch-manipulation ${
              showMovementPaths 
                ? 'bg-primary text-primary-foreground shadow-primary/30' 
                : 'bg-card/95 backdrop-blur-xl text-foreground border-border'
            }`}
          >
            <Route className="w-4.5 h-4.5 mr-2" />
            {showMovementPaths ? "Paths On" : "Paths Off"}
          </Button>

          {/* Heat Button - appears above Paths visually due to flex-col-reverse */}
          <Button
            onClick={() => {
              triggerHaptic('medium');
              const newState = !showDensityLayer;
              setShowDensityLayer(newState);
              if (newState) {
                setTimeFilter('all');
                setHourFilter(undefined);
                setDayFilter(undefined);
              }
            }}
            variant={showDensityLayer ? "default" : "outline"}
            size="sm"
            className={`w-full h-12 text-sm font-semibold rounded-xl shadow-lg transition-all duration-200 active:scale-95 touch-manipulation ${
              showDensityLayer 
                ? 'bg-primary text-primary-foreground shadow-primary/30' 
                : 'bg-card/95 backdrop-blur-xl text-foreground border-border'
            }`}
          >
            <Layers className="w-4.5 h-4.5 mr-2" />
            {showDensityLayer ? "Heat On" : "Heat Off"}
          </Button>

          {/* Mobile Path Filter Controls - Show when Paths layer is active */}
          <div 
            className={`overflow-hidden transition-all duration-200 ${
              showMovementPaths 
                ? 'max-h-[240px]' 
                : 'max-h-0'
            }`}
            style={{ contain: 'strict' }}
          >
            <div className="bg-card/95 backdrop-blur-xl rounded-xl border border-border p-2.5 shadow-lg space-y-2.5">
              <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                <span>Flow Filters</span>
                {pathsLoading && (
                  <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                )}
              </div>

              {/* Error UI */}
              {pathsError && (
                <div className="flex items-center gap-2 p-2 bg-destructive/10 rounded-lg text-xs">
                  <AlertCircle className="w-3.5 h-3.5 text-destructive flex-shrink-0" />
                  <span className="text-destructive truncate">Load failed</span>
                  <Button onClick={refreshPaths} variant="ghost" size="sm" className="h-6 text-xs px-2 ml-auto">
                    Retry
                  </Button>
                </div>
              )}

              {/* Time filter */}
              <Select value={pathTimeFilter} onValueChange={(v: any) => setPathTimeFilter(v)}>
                <SelectTrigger className="h-8 text-[10px] bg-background/80 transition-all duration-200" aria-label="Filter paths by time period">
                  <SelectValue placeholder="Time" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="this_week">This Week</SelectItem>
                  <SelectItem value="this_hour">This Hour</SelectItem>
                </SelectContent>
              </Select>

              {/* Frequency slider */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px]">
                  <label htmlFor="path-frequency-slider" className="text-muted-foreground">Min. Frequency</label>
                  <span className="font-semibold text-primary" aria-live="polite">{minPathFrequency}</span>
                </div>
                <input
                  id="path-frequency-slider"
                  type="range"
                  min="1"
                  max="10"
                  value={minPathFrequency}
                  onChange={(e) => setMinPathFrequency(parseInt(e.target.value))}
                  className="path-flow-slider w-full"
                  aria-label={`Minimum path frequency: ${minPathFrequency}`}
                  aria-valuemin={1}
                  aria-valuemax={10}
                  aria-valuenow={minPathFrequency}
                />
              </div>

              {/* Stats */}
              {pathData && (
                <div className="flex items-center gap-2 text-[9px] text-muted-foreground pt-1 border-t border-border/30">
                  <span>{pathData.stats.total_paths} paths</span>
                  <span>•</span>
                  <span>{pathData.stats.unique_users} users</span>
                </div>
              )}
            </div>
          </div>

          {/* Mobile Filter Controls - Show when Heat layer is active */}
          <div 
            className={`overflow-hidden transition-all duration-200 ${
              showDensityLayer 
                ? 'max-h-[280px]' 
                : 'max-h-0'
            }`}
            style={{ contain: 'strict' }}
          >
            <div className="bg-card/95 backdrop-blur-xl rounded-xl border border-border p-2 shadow-lg space-y-2">
              {/* Time-lapse toggle */}
              <Button
                onClick={() => {
                  triggerHaptic('medium');
                  const newMode = !timelapseMode;
                  setTimelapseMode(newMode);
                  if (newMode) {
                    timelapse.loadHourlyData();
                  }
                }}
                variant={timelapseMode ? "default" : "outline"}
                size="sm"
                className="w-full h-8 text-[10px] font-semibold transition-all duration-200 flex items-center justify-center gap-1.5"
              >
                <Clock className="w-3 h-3 flex-shrink-0" />
                <span>{timelapseMode ? "Time-lapse On" : "Time-lapse"}</span>
              </Button>

              {/* Time-lapse controls when active */}
              <div 
                className={`overflow-hidden transition-all duration-300 ease-out ${
                  timelapseMode 
                    ? 'max-h-[200px] opacity-100' 
                    : 'max-h-0 opacity-0'
                }`}
              >
                <div className="space-y-2 pt-1 border-t border-border/50 animate-fade-in">
                  {/* Play controls */}
                  <div className="flex items-center justify-between gap-1">
                    <Button
                      onClick={() => { triggerHaptic('light'); timelapse.stepBackward(); }}
                      variant="outline"
                      size="sm"
                      className="h-7 w-7 p-0 transition-transform duration-150 active:scale-90"
                      disabled={timelapse.isPlaying}
                      aria-label="Step backward one hour"
                    >
                      <SkipBack className="w-3 h-3" />
                    </Button>
                    <Button
                      onClick={() => { triggerHaptic('medium'); timelapse.isPlaying ? timelapse.pause() : timelapse.play(); }}
                      variant={timelapse.isPlaying ? "default" : "outline"}
                      size="sm"
                      className="h-7 flex-1 transition-all duration-200"
                      aria-label={timelapse.isPlaying ? "Pause time-lapse" : "Play time-lapse"}
                    >
                      {timelapse.isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                    </Button>
                    <Button
                      onClick={() => { triggerHaptic('light'); timelapse.stepForward(); }}
                      variant="outline"
                      size="sm"
                      className="h-7 w-7 p-0 transition-transform duration-150 active:scale-90"
                      disabled={timelapse.isPlaying}
                      aria-label="Step forward one hour"
                    >
                      <SkipForward className="w-3 h-3" />
                    </Button>
                  </div>

                  {/* Current hour display */}
                  <div className="text-center text-[10px] font-semibold text-primary transition-all duration-200">
                    {timelapse.formatHour(timelapse.currentHour)}
                  </div>

                  {/* Hour slider */}
                  <Slider
                    value={[timelapse.currentHour]}
                    onValueChange={([v]) => timelapse.setHour(v)}
                    min={0}
                    max={23}
                    step={1}
                    className="w-full"
                    disabled={timelapse.isPlaying}
                    aria-label={`Select hour of day: ${timelapse.formatHour(timelapse.currentHour)}`}
                  />

                  {/* Speed control */}
                  <div className="flex gap-1" role="group" aria-label="Time-lapse playback speed">
                    {[2, 1, 0.5].map((speed, i) => (
                      <Button
                        key={speed}
                        onClick={() => timelapse.setSpeed(speed)}
                        variant={timelapse.speed === speed ? "default" : "outline"}
                        size="sm"
                        className="h-6 flex-1 text-[9px] px-1 transition-all duration-200"
                        style={{ animationDelay: `${i * 50}ms` }}
                        aria-label={`Set playback speed to ${speed === 2 ? '0.5x' : speed === 1 ? '1x' : '2x'}`}
                        aria-pressed={timelapse.speed === speed}
                      >
                        {speed === 2 ? '0.5x' : speed === 1 ? '1x' : '2x'}
                      </Button>
                    ))}
                  </div>

                  {timelapse.loading && (
                    <div className="flex items-center justify-center gap-1 py-1 animate-fade-in">
                      <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      <span className="text-[9px] text-muted-foreground">Loading...</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Regular filters when time-lapse is off */}
              <div 
                className={`overflow-hidden transition-all duration-300 ease-out ${
                  !timelapseMode 
                    ? 'max-h-[200px] opacity-100' 
                    : 'max-h-0 opacity-0'
                }`}
              >
                <div className="space-y-2 animate-fade-in">
                  <Select value={timeFilter} onValueChange={(v: any) => setTimeFilter(v)}>
                    <SelectTrigger className="h-8 text-[10px] bg-background/80 transition-all duration-200" aria-label="Filter heatmap by time period">
                      <SelectValue placeholder="Time" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Time</SelectItem>
                      <SelectItem value="today">Today</SelectItem>
                      <SelectItem value="this_week">This Week</SelectItem>
                      <SelectItem value="this_hour">This Hour</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={hourFilter?.toString() || "all"} onValueChange={(v) => setHourFilter(v === "all" ? undefined : parseInt(v))}>
                    <SelectTrigger className="h-8 text-[10px] bg-background/80 transition-all duration-200" aria-label="Filter heatmap by hour of day">
                      <SelectValue placeholder="Hour" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Hours</SelectItem>
                      {Array.from({ length: 24 }, (_, i) => (
                        <SelectItem key={i} value={i.toString()}>{i}:00</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={dayFilter?.toString() || "all"} onValueChange={(v) => setDayFilter(v === "all" ? undefined : parseInt(v))}>
                    <SelectTrigger className="h-8 text-[10px] bg-background/80 transition-all duration-200" aria-label="Filter heatmap by day of week">
                      <SelectValue placeholder="Day" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Days</SelectItem>
                      <SelectItem value="0">Sun</SelectItem>
                      <SelectItem value="1">Mon</SelectItem>
                      <SelectItem value="2">Tue</SelectItem>
                      <SelectItem value="3">Wed</SelectItem>
                      <SelectItem value="4">Thu</SelectItem>
                      <SelectItem value="5">Fri</SelectItem>
                      <SelectItem value="6">Sat</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
          </div>
        </div>
      </div>
      )}

      {/* Desktop Controls Toggle Button */}
      {!isMobile && (
        <button
          onClick={() => { triggerHaptic('light'); setControlsCollapsed(!controlsCollapsed); }}
          className="absolute z-30 bg-card backdrop-blur-xl rounded-full p-2.5 border border-border shadow-lg transition-all duration-300 hover:bg-card/90 active:scale-95 min-w-[44px] min-h-[44px] flex items-center justify-center touch-manipulation"
          style={{
            bottom: 'var(--map-ui-inset-bottom)',
            right: controlsCollapsed 
              ? 'var(--map-ui-inset-right)'
              : 'calc(var(--map-ui-inset-right) + var(--map-control-max-width) + 0.5rem)',
          }}
          aria-label={controlsCollapsed ? "Show map controls" : "Hide map controls"}
        >
          {controlsCollapsed ? (
            <PanelRightOpen className="w-5 h-5 text-foreground" />
          ) : (
            <PanelRightClose className="w-5 h-5 text-foreground" />
          )}
        </button>
      )}


      {/* Statistics Panel - Shows active data counts */}
      {/* CRITICAL: Uses only opacity transition to avoid CLS - no translate/scale animations */}
      {(showDensityLayer || showMovementPaths) && (densityData || pathData) && (
        <div 
          className={`${isMobile ? 'fixed' : 'absolute'} bg-card/95 backdrop-blur-xl rounded-xl border border-border z-30 shadow-lg px-3 py-2`}
          style={{
            top: isMobile ? 'calc(env(safe-area-inset-top, 0px) + 70px)' : '80px',
            right: 'var(--map-ui-inset-right)',
            minWidth: '140px',
            // Use opacity-only transition to avoid CLS
            opacity: mapLoaded ? 1 : 0,
            visibility: mapLoaded ? 'visible' : 'hidden',
            transition: 'opacity 300ms ease-out, visibility 300ms ease-out',
            // GPU acceleration without layout-affecting transforms
            transform: 'translateZ(0)',
            willChange: 'opacity',
            pointerEvents: mapLoaded ? 'auto' : 'none',
          }}
        >
          <div className="flex flex-col gap-1.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Live Stats</p>
            
            {showDensityLayer && densityData && (
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[10px] text-muted-foreground">Hotspots</span>
                  <span className="text-xs font-bold text-primary">{densityData.stats.grid_cells}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[10px] text-muted-foreground">Data Points</span>
                  <span className="text-xs font-bold text-foreground">{densityData.stats.total_points}</span>
                </div>
                {densityData.stats.max_density > 0 && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[10px] text-muted-foreground">Peak Density</span>
                    <span className="text-xs font-bold text-orange-400">{densityData.stats.max_density}</span>
                  </div>
                )}
              </div>
            )}
            
            {showMovementPaths && pathData && (
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[10px] text-muted-foreground">Active Paths</span>
                  <span className="text-xs font-bold text-primary">{pathData.stats.total_paths}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[10px] text-muted-foreground">Movements</span>
                  <span className="text-xs font-bold text-foreground">{pathData.stats.total_movements}</span>
                </div>
                {pathData.stats.unique_users > 0 && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[10px] text-muted-foreground">Users Tracked</span>
                    <span className="text-xs font-bold text-green-400">{pathData.stats.unique_users}</span>
                  </div>
                )}
                {pathData.stats.max_frequency > 0 && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[10px] text-muted-foreground">Peak Traffic</span>
                    <span className="text-xs font-bold text-orange-400">{pathData.stats.max_frequency}x</span>
                  </div>
                )}
              </div>
            )}
            
            {/* Loading indicator */}
            {(densityLoading || pathsLoading) && (
              <div className="flex items-center gap-1.5 pt-1 border-t border-border/50">
                <div className="w-2 h-2 border border-primary border-t-transparent rounded-full animate-spin" />
                <span className="text-[9px] text-muted-foreground">Updating...</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Enhanced Legend - Bottom left, responsive for all devices, collapsible on mobile */}
      {/* CRITICAL: Uses only opacity transition to avoid CLS - no translate animations */}
      <div 
        className={`${isMobile ? 'fixed' : 'absolute'} bg-card/95 backdrop-blur-xl rounded-xl border border-border z-30 shadow-lg ${isMobile ? 'px-2 py-1.5' : 'px-3 py-2 md:px-4 md:py-3'}`}
        style={{
          bottom: isMobile ? 'var(--map-fixed-bottom)' : 'var(--map-ui-inset-bottom)',
          left: 'var(--map-ui-inset-left)',
          maxWidth: 'var(--map-control-max-width)',
          // Use opacity-only transition to avoid CLS
          opacity: mapLoaded && (isMobile ? !selectedVenue : !controlsCollapsed) ? 1 : 0,
          visibility: mapLoaded && (isMobile ? !selectedVenue : !controlsCollapsed) ? 'visible' : 'hidden',
          transition: 'opacity 300ms ease-out, visibility 300ms ease-out',
          // GPU acceleration without layout-affecting transforms
          transform: 'translateZ(0)',
          willChange: 'opacity',
          pointerEvents: mapLoaded && (isMobile ? !selectedVenue : !controlsCollapsed) ? 'auto' : 'none',
        }}
        onClick={isMobile ? () => { triggerHaptic('light'); setLegendCollapsed(!legendCollapsed); } : undefined}
      >
        {/* Mobile collapsed view - just shows indicator dots */}
        {isMobile && legendCollapsed ? (
          <div className="flex items-center gap-2 cursor-pointer">
            <span className="text-[9px] font-medium text-muted-foreground">Legend</span>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full shadow-sm" style={{ backgroundColor: 'hsl(0, 85%, 55%)' }} />
              <div className="w-2 h-2 rounded-full shadow-sm" style={{ backgroundColor: 'hsl(45, 100%, 55%)' }} />
              <div className="w-2 h-2 rounded-full shadow-sm" style={{ backgroundColor: 'hsl(210, 100%, 55%)' }} />
            </div>
            <ChevronUp className="w-3 h-3 text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Collapse indicator for mobile */}
            {isMobile && (
              <div className="flex justify-center mb-1 cursor-pointer">
                <ChevronDown className="w-3 h-3 text-muted-foreground" />
              </div>
            )}
            
            {showMovementPaths ? (
              <>
                <p className="text-[10px] sm:text-xs md:text-sm font-semibold text-foreground mb-1.5 sm:mb-2">User Flow Paths</p>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-1.5 sm:gap-2">
                  <div className="w-20 sm:w-24 md:w-32 h-3.5 sm:h-4 md:h-5 rounded-md shadow-inner" style={{
                    background: 'linear-gradient(to right, rgb(100, 200, 255), rgb(0, 255, 255), rgb(255, 200, 0), rgb(255, 100, 0), rgb(255, 0, 100))',
                    border: '1px solid rgba(255, 255, 255, 0.2)'
                  }} />
                  <div className="flex justify-between w-full text-[9px] sm:text-[10px] md:text-xs text-muted-foreground font-medium">
                    <span>Less Traffic</span>
                    <span>High Traffic</span>
                  </div>
                </div>
              </>
            ) : showDensityLayer ? (
              <>
                <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
                  <p className="text-[10px] sm:text-xs md:text-sm font-semibold text-foreground">
                    {timelapseMode ? 'Time-lapse' : 'User Density Heatmap'}
                  </p>
                  {timelapseMode && timelapse.isPlaying && (
                    <div className="flex items-center gap-1">
                      <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
                      <span className="text-[9px] sm:text-[10px] text-primary font-medium">{timelapse.formatHour(timelapse.currentHour)}</span>
                    </div>
                  )}
                </div>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-1.5 sm:gap-2">
                  <div className="w-20 sm:w-24 md:w-32 h-3.5 sm:h-4 md:h-5 rounded-md shadow-inner" style={{
                    background: 'linear-gradient(to right, rgba(65, 105, 225, 0.8), rgb(0, 255, 127), rgb(255, 255, 0), rgb(255, 165, 0), rgb(255, 0, 0), rgb(139, 0, 0))',
                    border: '1px solid rgba(255, 255, 255, 0.2)'
                  }} />
                  <div className="flex justify-between w-full text-[9px] sm:text-[10px] md:text-xs text-muted-foreground font-medium">
                    <span>Low</span>
                    <span>Medium</span>
                    <span>High</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col gap-1 sm:gap-0">
                <p className="text-[9px] sm:text-xs md:text-sm font-semibold text-muted-foreground mb-1 sm:mb-1.5 md:mb-2">Activity</p>
                <div className="flex flex-col gap-1 sm:flex-row sm:gap-2 md:gap-3">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 md:w-3 md:h-3 rounded-full shadow-sm" style={{ backgroundColor: 'hsl(0, 85%, 55%)' }} />
                    <span className="text-[9px] sm:text-[10px] md:text-xs text-foreground">Hot</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 md:w-3 md:h-3 rounded-full shadow-sm" style={{ backgroundColor: 'hsl(45, 100%, 55%)' }} />
                    <span className="text-[9px] sm:text-[10px] md:text-xs text-foreground">Warm</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 md:w-3 md:h-3 rounded-full shadow-sm" style={{ backgroundColor: 'hsl(210, 100%, 55%)' }} />
                    <span className="text-[9px] sm:text-[10px] md:text-xs text-foreground">Cool</span>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Enhanced Heatmap Loading Overlay */}
      {showDensityLayer && densityLoading && (
        <div 
          className="absolute inset-0 flex items-center justify-center bg-background/30 backdrop-blur-md z-20"
          style={{
            // Use opacity-only transition to avoid CLS
            animation: 'fadeIn 200ms ease-out forwards',
          }}
        >
          <div 
            className="bg-card/95 backdrop-blur-xl rounded-xl border border-border p-6 flex flex-col items-center gap-4 shadow-2xl"
            style={{
              // Avoid scale animations that cause CLS
              transform: 'translateZ(0)',
            }}
          >
            <div className="relative">
              <div className="w-12 h-12 border-4 border-primary/30 rounded-full" />
              <div className="absolute inset-0 w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-foreground mb-1">Loading Density Data</p>
              <p className="text-xs text-muted-foreground">Analyzing user hotspots...</p>
            </div>
          </div>
        </div>
      )}

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
          background: rgba(15, 15, 25, 0.96) !important;
          backdrop-filter: blur(16px) saturate(180%) !important;
          -webkit-backdrop-filter: blur(16px) saturate(180%) !important;
          border-radius: 16px !important;
          border: 1px solid rgba(255, 255, 255, 0.12) !important;
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05) inset !important;
          padding: 0 !important;
          overflow: hidden;
        }
        
        .mapboxgl-popup-close-button {
          color: rgba(255, 255, 255, 0.7) !important;
          font-size: 20px !important;
          padding: 6px 10px !important;
          right: 4px !important;
          top: 4px !important;
          transition: color 0.2s ease !important;
        }
        
        .mapboxgl-popup-close-button:hover {
          color: white !important;
          background: rgba(255, 255, 255, 0.1) !important;
          border-radius: 6px !important;
        }
        
        .mapboxgl-popup-tip {
          border-top-color: rgba(15, 15, 25, 0.96) !important;
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
