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

export const useHeatmapTimelapse = (dayFilter?: number) => {
  const [state, setState] = useState<TimelapseState>({
    isPlaying: false,
    currentHour: 0,
    speed: 1,
    hourlyData: [],
    loading: false,
    error: null,
  });
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
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
      const hourlyPromises = Array.from({ length: 24 }, async (_, hour) => {
        const params = new URLSearchParams();
        params.append('time_filter', 'all');
        params.append('hour_of_day', hour.toString());
        if (dayFilter !== undefined) {
          params.append('day_of_week', dayFilter.toString());
        }

        const { data, error } = await supabase.functions.invoke(
          `get-location-density?${params.toString()}`
        );

        if (error) throw error;

        return {
          hour,
          geojson: data.geojson,
          stats: data.stats,
        };
      });

      const results = await Promise.all(hourlyPromises);
      
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
