import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface HourlyDensityData {
  hour: number;
  geojson: any;
  stats: {
    total_points: number;
    grid_cells: number;
    max_density: number;
    avg_density: number;
  };
}

interface TimelapseState {
  isPlaying: boolean;
  currentHour: number;
  speed: number; // seconds per hour
  hourlyData: HourlyDensityData[];
  loading: boolean;
  error: string | null;
}

export const useHeatmapTimelapse = (dayFilter?: number, initialSpeed = 1) => {
  const [state, setState] = useState<TimelapseState>({
    isPlaying: false,
    currentHour: 0,
    speed: initialSpeed,
    hourlyData: [],
    loading: false,
    error: null,
  });
  
  const intervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Fetch data for all 24 hours
  const loadHourlyData = useCallback(async () => {
    // Cancel any pending requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      // The density endpoint requires an authenticated caller and is IP rate
      // limited. Bail out early when signed out instead of firing 24 requests
      // that all come back 401.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setState(prev => ({
          ...prev,
          loading: false,
          hourlyData: [],
          error: 'unauthorized',
        }));
        return;
      }

      const fetchHour = async (hour: number) => {
        const body: Record<string, string | number> = {
          time_filter: 'all',
          hour_of_day: hour,
        };
        if (dayFilter !== undefined) {
          body.day_of_week = dayFilter;
        }

        const { data, error } = await supabase.functions.invoke(
          'get-location-density',
          {
            body: JSON.stringify(body),
            headers: { Authorization: `Bearer ${session.access_token}` },
          }
        );

        if (error) throw error;

        return {
          hour,
          geojson: data.geojson,
          stats: data.stats,
        };
      };

      // Stay under the endpoint's per-IP rate limit by fetching in small
      // sequential batches rather than 24 simultaneous requests.
      const BATCH_SIZE = 4;
      const results: HourlyDensityData[] = [];
      for (let i = 0; i < 24; i += BATCH_SIZE) {
        if (abortControllerRef.current?.signal.aborted) return;
        const batch = Array.from({ length: Math.min(BATCH_SIZE, 24 - i) }, (_, k) => i + k);
        results.push(...(await Promise.all(batch.map(fetchHour))));
      }
      
      setState(prev => ({
        ...prev,
        hourlyData: results,
        loading: false,
        currentHour: new Date().getHours(), // Start at current hour
      }));
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      
      console.error('Error loading hourly data:', err);
      setState(prev => ({
        ...prev,
        loading: false,
        error: 'Failed to load time-lapse data',
      }));
    }
  }, [dayFilter]);

  // Play/pause animation
  const togglePlay = useCallback(() => {
    setState(prev => ({ ...prev, isPlaying: !prev.isPlaying }));
  }, []);

  const play = useCallback(() => {
    setState(prev => ({ ...prev, isPlaying: true }));
  }, []);

  const pause = useCallback(() => {
    setState(prev => ({ ...prev, isPlaying: false }));
  }, []);

  const setHour = useCallback((hour: number) => {
    setState(prev => ({ ...prev, currentHour: hour % 24 }));
  }, []);

  const setSpeed = useCallback((speed: number) => {
    setState(prev => ({ ...prev, speed }));
  }, []);

  const stepForward = useCallback(() => {
    setState(prev => ({ ...prev, currentHour: (prev.currentHour + 1) % 24 }));
  }, []);

  const stepBackward = useCallback(() => {
    setState(prev => ({ ...prev, currentHour: (prev.currentHour - 1 + 24) % 24 }));
  }, []);

  // Animation loop
  useEffect(() => {
    if (state.isPlaying && state.hourlyData.length > 0) {
      intervalRef.current = setInterval(() => {
        setState(prev => ({
          ...prev,
          currentHour: (prev.currentHour + 1) % 24,
        }));
      }, state.speed * 1000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [state.isPlaying, state.speed, state.hourlyData.length]);

  // Get current hour's data
  const currentData = state.hourlyData.find(d => d.hour === state.currentHour);

  // Format hour for display
  const formatHour = (hour: number) => {
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:00 ${period}`;
  };

  return {
    ...state,
    currentData,
    formatHour,
    loadHourlyData,
    togglePlay,
    play,
    pause,
    setHour,
    setSpeed,
    stepForward,
    stepBackward,
  };
};
