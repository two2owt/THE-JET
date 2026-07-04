import { useEffect, useState, useId, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

interface MovementPathData {
  geojson: any;
  stats: {
    total_paths: number;
    total_movements: number;
    unique_users: number;
    max_frequency: number;
    avg_frequency: number;
  };
}

interface MovementPathFilters {
  timeFilter?: 'all' | 'today' | 'this_week' | 'this_hour';
  minFrequency?: number;
  /** When set, takes precedence over `timeFilter`. Filters user_locations to
   *  rows whose `created_at` is within the last N minutes on the server. */
  windowMinutes?: number;
}

export const useMovementPaths = (filters: MovementPathFilters = {}) => {
  const [pathData, setPathData] = useState<MovementPathData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);
  // Per-instance channel name prevents silent dedupe on remount.
  const instanceId = useId();
  const isLoadingRef = useRef(false);

  const loadPathData = useCallback(async () => {
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;
    try {
      setLoading(true);
      
      const params = new URLSearchParams();
      if (filters.windowMinutes && filters.windowMinutes > 0) {
        params.append('time_window_minutes', String(Math.floor(filters.windowMinutes)));
      } else if (filters.timeFilter) {
        params.append('time_filter', filters.timeFilter);
      }
      if (filters.minFrequency !== undefined) params.append('min_frequency', filters.minFrequency.toString());

      const queryString = params.toString();
      const path = queryString ? `get-movement-paths?${queryString}` : 'get-movement-paths';

      const { data, error: functionError } = await supabase.functions.invoke(path);

      if (functionError) throw functionError;
      
      setPathData(data);
      setError(null);
      setUnauthorized(false);
    } catch (err) {
      const status = (err as { context?: { status?: number } })?.context?.status;
      if (status === 401 || status === 403) {
        console.info('Movement paths unavailable (admin-only endpoint).');
        setUnauthorized(true);
        setError('unauthorized');
      } else {
        console.error('Error loading movement path data:', err);
        setUnauthorized(false);
        setError('Failed to load movement paths');
      }
    } finally {
      setLoading(false);
      isLoadingRef.current = false;
    }
  }, [filters.timeFilter, filters.minFrequency, filters.windowMinutes]);

  useEffect(() => {
    loadPathData();

    // Realtime subscription — debounce so a burst of location writes doesn't
    // trigger a chain of edge-function invocations.
    let debounceTimer: ReturnType<typeof setTimeout>;
    const channel = supabase
      .channel(`movement-path-updates:${instanceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_locations',
        },
        () => {
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            loadPathData();
          }, 700);
        }
      )
      .subscribe();

    return () => {
      clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [loadPathData, instanceId]);

  return { pathData, loading, error, unauthorized, refresh: loadPathData };
};
