import { useEffect, useState, useId } from "react";
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
}

export const useMovementPaths = (filters: MovementPathFilters = {}) => {
  const [pathData, setPathData] = useState<MovementPathData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);
  // Per-instance channel name prevents silent dedupe on remount.
  const instanceId = useId();

  const loadPathData = async () => {
    try {
      setLoading(true);
      
      const params = new URLSearchParams();
      if (filters.timeFilter) params.append('time_filter', filters.timeFilter);
      if (filters.minFrequency !== undefined) params.append('min_frequency', filters.minFrequency.toString());

      const queryString = params.toString();
      const path = queryString ? `get-movement-paths?${queryString}` : 'get-movement-paths';

      const { data, error: functionError } = await supabase.functions.invoke(path);

      if (functionError) throw functionError;
      
      setPathData(data);
      setError(null);
      setUnauthorized(false);
    } catch (err) {
      console.error('Error loading movement path data:', err);
      const status = (err as { context?: { status?: number } })?.context?.status;
      if (status === 401 || status === 403) {
        setUnauthorized(true);
        setError('unauthorized');
      } else {
        setUnauthorized(false);
        setError('Failed to load movement paths');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPathData();

    // Set up realtime subscription to user_locations
    const channel = supabase
      .channel(`movement-path-updates:${instanceId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'user_locations',
        },
        () => {
          loadPathData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [filters.timeFilter, filters.minFrequency, instanceId]);

  return { pathData, loading, error, unauthorized, refresh: loadPathData };
};
