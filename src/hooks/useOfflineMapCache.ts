import { useState, useEffect, useCallback } from "react";

interface CacheStats {
  mapboxTiles: number;
  mapboxApi: number;
  totalSize: string;
  lastUpdated: Date | null;
}

/**
 * Hook to get cache statistics for offline map support
 */
export const useOfflineMapCache = () => {
  const [cacheStats, setCacheStats] = useState<CacheStats>({
    mapboxTiles: 0,
    mapboxApi: 0,
    totalSize: "0 KB",
    lastUpdated: null,
  });
  const [isCalculating, setIsCalculating] = useState(false);

  const calculateCacheStats = useCallback(async () => {
    if (!("caches" in window)) {
      return;
    }

    setIsCalculating(true);

    try {
      const cacheNames = await caches.keys();
      let tileCount = 0;
      let apiCount = 0;
      let totalBytes = 0;

      for (const name of cacheNames) {
        if (name.includes("mapbox-tiles")) {
          const cache = await caches.open(name);
          const keys = await cache.keys();
          tileCount += keys.length;

          // Estimate size (can't get exact size without fetching each response)
          // Average tile is ~20KB
          totalBytes += keys.length * 20 * 1024;
        } else if (name.includes("mapbox-api")) {
          const cache = await caches.open(name);
          const keys = await cache.keys();
          apiCount += keys.length;
          // API responses average ~5KB
          totalBytes += keys.length * 5 * 1024;
        }
      }

      // Format size
      let sizeStr = "0 KB";
      if (totalBytes > 1024 * 1024) {
        sizeStr = `${(totalBytes / (1024 * 1024)).toFixed(1)} MB`;
      } else if (totalBytes > 1024) {
        sizeStr = `${(totalBytes / 1024).toFixed(0)} KB`;
      }

      setCacheStats({
        mapboxTiles: tileCount,
        mapboxApi: apiCount,
        totalSize: sizeStr,
        lastUpdated: new Date(),
      });
    } catch (error) {
      console.error("Failed to calculate cache stats:", error);
    } finally {
      setIsCalculating(false);
    }
  }, []);

  // Calculate stats on mount
  useEffect(() => {
    calculateCacheStats();
  }, [calculateCacheStats]);

  const clearMapCache = useCallback(async () => {
    if (!("caches" in window)) return;

    try {
      const cacheNames = await caches.keys();
      for (const name of cacheNames) {
        if (name.includes("mapbox")) {
          await caches.delete(name);
        }
      }

      // Clear prefetch timestamp to allow re-prefetching
      localStorage.removeItem("tile_prefetch_timestamp");

      // Recalculate stats
      await calculateCacheStats();
    } catch (error) {
      console.error("Failed to clear map cache:", error);
    }
  }, [calculateCacheStats]);

  return {
    cacheStats,
    isCalculating,
    refreshStats: calculateCacheStats,
    clearMapCache,
    hasCachedTiles: cacheStats.mapboxTiles > 0,
  };
};

export default useOfflineMapCache;
