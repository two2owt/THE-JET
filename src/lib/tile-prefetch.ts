/**
 * Mapbox tile prefetching for faster repeat visits
 * Prefetches tiles based on user's last known location or default city
 */

import { CITIES } from "@/types/cities";

// Default city for prefetching (Charlotte)
const DEFAULT_CITY = CITIES[0];

// Zoom levels to prefetch (city overview to neighborhood level)
const PREFETCH_ZOOM_LEVELS = [10, 11, 12, 13, 14];

// Max tiles per zoom level to avoid excessive prefetching
const MAX_TILES_PER_ZOOM = 16;

// LocalStorage keys
const LAST_LOCATION_KEY = 'jet_last_known_location';
const PREFETCH_TIMESTAMP_KEY = 'tile_prefetch_timestamp';
const TOKEN_CACHE_KEY = 'mapbox_token_cache_v2';
const LEGACY_TOKEN_CACHE_KEY = 'mapbox_token_cache';

interface LastKnownLocation {
  lat: number;
  lng: number;
  city?: string;
  timestamp: number;
}

/**
 * Store the user's last known location for prefetching
 */
export function storeLastKnownLocation(lat: number, lng: number, city?: string): void {
  const location: LastKnownLocation = {
    lat,
    lng,
    city,
    timestamp: Date.now(),
  };
  
  try {
    localStorage.setItem(LAST_LOCATION_KEY, JSON.stringify(location));
  } catch (e) {
    if (import.meta.env.DEV) console.warn('Failed to store last location:', e);
  }
}

/**
 * Get the user's last known location
 */
export function getLastKnownLocation(): LastKnownLocation | null {
  try {
    const stored = localStorage.getItem(LAST_LOCATION_KEY);
    if (!stored) return null;
    
    const location: LastKnownLocation = JSON.parse(stored);
    
    // Consider location stale after 7 days
    const maxAge = 7 * 24 * 60 * 60 * 1000;
    if (Date.now() - location.timestamp > maxAge) {
      return null;
    }
    
    return location;
  } catch {
    return null;
  }
}

/**
 * Convert lat/lng to tile coordinates
 */
function latLngToTile(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const n = Math.pow(2, zoom);
  const x = Math.floor((lng + 180) / 360 * n);
  const latRad = lat * Math.PI / 180;
  const y = Math.floor((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2 * n);
  return { x, y };
}

/**
 * Generate tile URLs for a given area and zoom level
 */
function generateTileUrls(
  centerLat: number,
  centerLng: number,
  zoom: number,
  token: string,
  style: string = 'dark-v11'
): string[] {
  const urls: string[] = [];
  const centerTile = latLngToTile(centerLat, centerLng, zoom);
  
  // Calculate tile radius based on zoom level (fewer tiles at higher zooms)
  const radius = zoom <= 11 ? 2 : zoom <= 13 ? 1 : 0;
  
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dy = -radius; dy <= radius; dy++) {
      const x = centerTile.x + dx;
      const y = centerTile.y + dy;
      
      // Mapbox vector tile URL format
      urls.push(
        `https://api.mapbox.com/styles/v1/mapbox/${style}/tiles/${zoom}/${x}/${y}@2x?access_token=${token}`
      );
      
      if (urls.length >= MAX_TILES_PER_ZOOM) break;
    }
    if (urls.length >= MAX_TILES_PER_ZOOM) break;
  }
  
  return urls;
}

/**
 * Get the cached Mapbox token
 */
function getCachedToken(): string | null {
  const tokenCache = localStorage.getItem(TOKEN_CACHE_KEY) ||
                     sessionStorage.getItem(TOKEN_CACHE_KEY);

  if (!tokenCache) {
    // Clear legacy key so rotated tokens take effect immediately
    try {
      localStorage.removeItem(LEGACY_TOKEN_CACHE_KEY);
      sessionStorage.removeItem(LEGACY_TOKEN_CACHE_KEY);
    } catch {
      // ignore
    }
    return null;
  }

  try {
    const { token } = JSON.parse(tokenCache);
    if (typeof token !== 'string' || !token.startsWith('pk.')) return null;
    return token;
  } catch {
    return null;
  }
}

/**
 * Prefetch tiles for a specific location
 */
async function prefetchTilesForLocation(
  lat: number, 
  lng: number, 
  token: string,
  locationName?: string
): Promise<{ success: number; total: number }> {
  if (import.meta.env.DEV) console.log(`Tile prefetch: Starting for ${locationName || `${lat.toFixed(4)}, ${lng.toFixed(4)}`}`);
  
  // Generate tile URLs for each zoom level
  const allUrls: string[] = [];
  for (const zoom of PREFETCH_ZOOM_LEVELS) {
    const urls = generateTileUrls(lat, lng, zoom, token);
    allUrls.push(...urls);
  }
  
  let successCount = 0;
  
  // Prefetch in batches to avoid overwhelming the network
  const BATCH_SIZE = 4;
  for (let i = 0; i < allUrls.length; i += BATCH_SIZE) {
    const batch = allUrls.slice(i, i + BATCH_SIZE);
    
    const results = await Promise.allSettled(
      batch.map(url => 
        fetch(url, {
          mode: 'cors',
          credentials: 'omit',
          cache: 'force-cache',
        }).then(res => res.ok)
      )
    );
    
    successCount += results.filter(r => r.status === 'fulfilled' && r.value).length;
    
    // Small delay between batches
    if (i + BATCH_SIZE < allUrls.length) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
  
  return { success: successCount, total: allUrls.length };
}

/**
 * Prefetch Mapbox tiles for the user's last known location or default city
 */
export async function prefetchTilesForLastLocation(): Promise<void> {
  const token = getCachedToken();
  if (!token) {
    if (import.meta.env.DEV) console.log('Tile prefetch: No token cached, skipping');
    return;
  }
  
  // Check if we've already prefetched recently
  const lastPrefetch = localStorage.getItem(PREFETCH_TIMESTAMP_KEY);
  if (lastPrefetch) {
    const elapsed = Date.now() - parseInt(lastPrefetch, 10);
    // Only prefetch once per 12 hours
    if (elapsed < 12 * 60 * 60 * 1000) {
      if (import.meta.env.DEV) console.log('Tile prefetch: Already prefetched recently');
      return;
    }
  }
  
  // Get last known location or use default city
  const lastLocation = getLastKnownLocation();
  const prefetchLocation = lastLocation || {
    lat: DEFAULT_CITY.lat,
    lng: DEFAULT_CITY.lng,
    city: DEFAULT_CITY.name,
  };
  
  const result = await prefetchTilesForLocation(
    prefetchLocation.lat,
    prefetchLocation.lng,
    token,
    prefetchLocation.city || 'Last location'
  );
  
  if (import.meta.env.DEV) console.log(`Tile prefetch: Completed ${result.success}/${result.total} tiles`);
  
  // Record prefetch timestamp
  localStorage.setItem(PREFETCH_TIMESTAMP_KEY, Date.now().toString());
}

/**
 * Legacy function for backwards compatibility
 */
export async function prefetchDefaultCityTiles(): Promise<void> {
  return prefetchTilesForLastLocation();
}

/**
 * Request the service worker to prefetch tiles in the background
 */
export function requestServiceWorkerPrefetch(): void {
  if (!('serviceWorker' in navigator)) return;
  
  const lastLocation = getLastKnownLocation();
  const token = getCachedToken();
  
  if (!token) return;
  
  const location = lastLocation || {
    lat: DEFAULT_CITY.lat,
    lng: DEFAULT_CITY.lng,
  };
  
  // Generate tile URLs to send to service worker
  const tileUrls: string[] = [];
  for (const zoom of PREFETCH_ZOOM_LEVELS.slice(0, 3)) { // Only first 3 zoom levels for SW
    tileUrls.push(...generateTileUrls(location.lat, location.lng, zoom, token));
  }
  
  // Send message to service worker to prefetch
  navigator.serviceWorker.ready.then(registration => {
    if (registration.active) {
      registration.active.postMessage({
        type: 'PREFETCH_TILES',
        urls: tileUrls.slice(0, 20), // Limit to 20 tiles for SW
      });
    }
  });
}

/**
 * Initialize tile prefetching based on connection speed
 */
export function initTilePrefetching(): void {
  // Check connection type - skip on slow connections
  const connection = (navigator as any).connection || 
                     (navigator as any).mozConnection || 
                     (navigator as any).webkitConnection;
  
  if (connection) {
    const effectiveType = connection.effectiveType;
    const saveData = connection.saveData;
    
    // Skip prefetching on slow connections or save-data mode
    if (saveData || ['slow-2g', '2g'].includes(effectiveType)) {
      if (import.meta.env.DEV) console.log('Tile prefetch: Skipped due to slow connection');
      return;
    }
  }
  
  // Wait for the page to be fully interactive
  if (document.readyState === 'complete') {
    schedulePrefetch();
  } else {
    window.addEventListener('load', schedulePrefetch, { once: true });
  }
}

function schedulePrefetch(): void {
  // Wait 10 seconds after load to avoid competing with critical resources
  setTimeout(() => {
    if ('requestIdleCallback' in window) {
      requestIdleCallback(
        () => {
          prefetchTilesForLastLocation();
          // Also request SW prefetch for background caching
          requestServiceWorkerPrefetch();
        },
        { timeout: 30000 }
      );
    } else {
      prefetchTilesForLastLocation();
      requestServiceWorkerPrefetch();
    }
  }, 10000);
}
