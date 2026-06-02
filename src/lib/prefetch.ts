/**
 * Prefetch utilities for loading resources during idle time
 */

import { supabase } from "@/integrations/supabase/client";

let mapboxPrefetched = false;
let mapboxTokenPrefetched = false;

const TOKEN_CACHE_KEY = 'mapbox_token_cache_v2';
const TOKEN_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Prefetch the Mapbox token from the edge function
 * This ensures the token is cached before the map component mounts
 */
export const prefetchMapboxToken = async () => {
  if (mapboxTokenPrefetched) return;
  
  // Check if already cached
  try {
    const cached = localStorage.getItem(TOKEN_CACHE_KEY) || sessionStorage.getItem(TOKEN_CACHE_KEY);
    if (cached) {
      const { timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < TOKEN_CACHE_DURATION) {
        mapboxTokenPrefetched = true;
        return; // Already have a valid cached token
      }
    }
  } catch {
    // Continue to fetch
  }
  
  mapboxTokenPrefetched = true;
  
  try {
    const { data, error } = await supabase.functions.invoke("get-mapbox-token");
    if (!error && data?.token) {
      const cache = { token: data.token, timestamp: Date.now() };
      localStorage.setItem(TOKEN_CACHE_KEY, JSON.stringify(cache));
      sessionStorage.setItem(TOKEN_CACHE_KEY, JSON.stringify(cache));
      console.log('Prefetch: Mapbox token cached successfully');
    }
  } catch {
    mapboxTokenPrefetched = false;
  }
};

/**
 * Prefetch the Mapbox chunk during browser idle time
 * Uses dynamic import to trigger chunk loading without executing
 */
export const prefetchMapbox = () => {
  if (mapboxPrefetched) return;
  mapboxPrefetched = true;
  
  // In production, mapbox-gl is loaded from CDN via script tag
  // Check if it's already available globally
  if (typeof window !== 'undefined' && (window as any).mapboxgl) {
    console.log('Prefetch: Mapbox already loaded from CDN');
    return;
  }
  
  // Fallback: trigger the chunk download by importing the module (dev mode)
  import('mapbox-gl').then(() => {
    console.log('Prefetch: Mapbox chunk loaded and cached');
  }).catch(() => {
    mapboxPrefetched = false;
  });
};

// ========================================
// ROUTE PREFETCHING
// Preload likely navigation destinations for instant transitions
// ========================================

let routesPrefetched = false;

// Route imports grouped by priority
const ROUTE_IMPORTS = {
  // High priority: bottom nav items users are most likely to visit
  high: [
    () => import("@/pages/Favorites"),
    () => import("@/pages/Social"),
    () => import("@/pages/Profile"),
  ],
  // Medium priority: auth (Settings is now embedded inside Profile)
  medium: [
    () => import("@/pages/Auth"),
  ],
  // Low priority: less frequently accessed
  low: [
    () => import("@/pages/Onboarding"),
    () => import("@/pages/PrivacyPolicy"),
    () => import("@/pages/TermsOfService"),
  ],
};

/**
 * Prefetch a batch of route imports silently
 */
const prefetchBatch = (routes: Array<() => Promise<unknown>>) => {
  routes.forEach((importFn) => {
    try {
      importFn().catch(() => {});
    } catch {
      // Ignore errors
    }
  });
};

/**
 * Prefetch route chunks in order of priority
 * Uses requestIdleCallback to avoid blocking the main thread
 */
export const prefetchRoutes = () => {
  if (routesPrefetched) return;
  routesPrefetched = true;

  // High priority: after 2s (user likely exploring the map)
  setTimeout(() => {
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => prefetchBatch(ROUTE_IMPORTS.high), { timeout: 3000 });
    } else {
      prefetchBatch(ROUTE_IMPORTS.high);
    }
  }, 2000);

  // Medium priority: after 5s
  setTimeout(() => {
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => prefetchBatch(ROUTE_IMPORTS.medium), { timeout: 3000 });
    } else {
      prefetchBatch(ROUTE_IMPORTS.medium);
    }
  }, 5000);

  // Low priority: after 10s
  setTimeout(() => {
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => prefetchBatch(ROUTE_IMPORTS.low), { timeout: 5000 });
    } else {
      prefetchBatch(ROUTE_IMPORTS.low);
    }
  }, 10000);
};

/**
 * Prefetch a specific route on hover/focus for instant navigation
 * Use this on navigation links for even faster transitions
 */
export const createPrefetchHandlers = (routeImport: () => Promise<unknown>) => {
  let prefetched = false;
  
  const prefetch = () => {
    if (!prefetched) {
      prefetched = true;
      routeImport().catch(() => {});
    }
  };
  
  return {
    onMouseEnter: prefetch,
    onFocus: prefetch,
    onTouchStart: prefetch,
  };
};

/**
 * Register prefetch handlers to load resources during idle time
 * Should be called once on app initialization
 */
export const initPrefetching = () => {
  // Check if we should defer prefetching based on connection
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  const shouldDefer = connection?.saveData || connection?.effectiveType === '2g' || connection?.effectiveType === 'slow-2g';
  
  // Prefetch Mapbox token - defer on slow connections
  if (shouldDefer) {
    // On slow connections, wait until after LCP
    setTimeout(prefetchMapboxToken, 5000);
  } else {
    // On fast connections, start after a short delay to not block critical path
    setTimeout(prefetchMapboxToken, 1000);
  }
  
  // Wait for initial render to complete, then prefetch JS chunks during idle
  const startPrefetching = () => {
    // Use requestIdleCallback for non-critical prefetching
    const scheduleMapboxPrefetch = () => {
      if ('requestIdleCallback' in window) {
        requestIdleCallback(() => prefetchMapbox(), { timeout: 10000 });
      } else {
        setTimeout(prefetchMapbox, 5000);
      }
    };
    
    // Delay based on connection speed
    const delay = shouldDefer ? 8000 : 4000;
    setTimeout(scheduleMapboxPrefetch, delay);
    
    // Route prefetching with longer delays on slow connections
    if (!shouldDefer) {
      prefetchRoutes();
    } else {
      setTimeout(prefetchRoutes, 10000);
    }
  };
  
  if (document.readyState === 'complete') {
    startPrefetching();
  } else {
    window.addEventListener('load', startPrefetching, { once: true });
  }
};
