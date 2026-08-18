import { devLog } from "@/lib/log";
/**
 * Utility to clear cached Mapbox token
 * This is useful when the token has been updated or there are loading issues
 */
export const clearMapboxTokenCache = (): void => {
  try {
    // Current cache key
    localStorage.removeItem("mapbox_token_cache_v2");
    sessionStorage.removeItem("mapbox_token_cache_v2");

    // Legacy cache key
    localStorage.removeItem("mapbox_token_cache");
    sessionStorage.removeItem("mapbox_token_cache");

    devLog("✅ Mapbox token cache cleared");
  } catch (error) {
    console.error("Failed to clear Mapbox token cache:", error);
  }
};

// Make it available globally for easy console access
if (typeof window !== "undefined") {
  (window as any).clearMapboxCache = clearMapboxTokenCache;
}
