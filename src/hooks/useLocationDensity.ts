import { useEffect, useState, useRef, useCallback, useId } from "react";
import { supabase } from "@/integrations/supabase/client";

interface DensityData {
  geojson: any;
  stats: {
    total_points: number;
    grid_cells: number;
    max_density: number;
    avg_density: number;
  };
}

interface DensityFilters {
  timeFilter?: 'all' | 'today' | 'this_week' | 'this_hour';
  hourOfDay?: number;
  dayOfWeek?: number;
}

export const useLocationDensity = (filters: DensityFilters = {}) => {
  const [densityData, setDensityData] = useState<DensityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const lastDataHashRef = useRef<string>('');
  const isLoadingRef = useRef(false);
  // Per-instance channel name prevents the Supabase client from silently
  // deduping concurrent subscriptions when the hook remounts (e.g. city switch).
  const instanceId = useId();

  const loadDensityData = useCallback(async () => {
    // Prevent concurrent requests
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;
    
    try {
      setLoading(true);
      
      const body: Record<string, string | number> = {};
      if (filters.timeFilter) body.time_filter = filters.timeFilter;
      if (filters.hourOfDay !== undefined) body.hour_of_day = filters.hourOfDay;
      if (filters.dayOfWeek !== undefined) body.day_of_week = filters.dayOfWeek;

      const { data, error: functionError } = await supabase.functions.invoke('get-location-density', {
        body: JSON.stringify(body),
      });

      if (functionError) throw functionError;
      
      // Only update state if data actually changed
      const dataHash = JSON.stringify(data?.stats);
      if (dataHash !== lastDataHashRef.current) {
        lastDataHashRef.current = dataHash;
        setDensityData(data);
      }
      setError(null);
      setUnauthorized(false);
    } catch (err) {
      console.error('Error loading density data:', err);
      const status = (err as { context?: { status?: number } })?.context?.status;
      if (status === 401 || status === 403) {
        setUnauthorized(true);
        setError('unauthorized');
      } else {
        setUnauthorized(false);
        setError('Failed to load density data');
      }
    } finally {
      setLoading(false);
      isLoadingRef.current = false;
    }
  }, [filters.timeFilter, filters.hourOfDay, filters.dayOfWeek]);

  useEffect(() => {
    loadDensityData();

    // Set up realtime subscription with debounce
    let debounceTimer: ReturnType<typeof setTimeout>;
    const channel = supabase
      .channel(`location-density-updates:${instanceId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'user_locations',
        },
        () => {
          // Debounce to prevent rapid re-fetching
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            loadDensityData();
          }, 2000);
        }
      )
      .subscribe();

    return () => {
      clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [loadDensityData, instanceId]);

  return { densityData, loading, error, unauthorized, refresh: loadDensityData };
};
