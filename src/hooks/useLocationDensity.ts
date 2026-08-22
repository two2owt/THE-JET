import { useEffect, useState, useRef, useCallback, useId } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMapDataPulse } from "@/hooks/useMapDataPulse";

import {
  recordEndToEndFreshness,
  recordMapSyncLatency,
} from "@/lib/mapSyncLatency";


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
  timeFilter?: "all" | "today" | "this_week" | "this_hour";
  hourOfDay?: number;
  dayOfWeek?: number;
  /** When set, takes precedence over `timeFilter`. Filters user_locations to
   *  rows whose `created_at` is within the last N minutes on the server. */
  windowMinutes?: number;
}

export const useLocationDensity = (filters: DensityFilters = {}) => {
  const [densityData, setDensityData] = useState<DensityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const lastDataHashRef = useRef<string>("");
  const isLoadingRef = useRef(false);
  const pendingRefetchRef = useRef(false);
  // Per-instance channel name prevents the Supabase client from silently
  // deduping concurrent subscriptions when the hook remounts (e.g. city switch).
  const instanceId = useId();

  const loadDensityData = useCallback(async () => {
    // Prevent concurrent requests, but remember that another run was requested
    // so an auth-driven refetch is never silently dropped.
    if (isLoadingRef.current) {
      pendingRefetchRef.current = true;
      return;
    }
    isLoadingRef.current = true;
    pendingRefetchRef.current = false;

    try {
      setLoading(true);

      // Revalidate the identity with Auth before calling the protected endpoint.
      // getSession() alone only reads local storage and can briefly return a
      // stale token while OAuth hydration or a token refresh is completing.
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) {
        setUnauthorized(true);
        setError("unauthorized");
        setDensityData(null);
        lastDataHashRef.current = "";
        return;
      }

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();
      if (sessionError || !session?.access_token) {
        setUnauthorized(true);
        setError("unauthorized");
        setDensityData(null);
        lastDataHashRef.current = "";
        return;
      }

      const body: Record<string, string | number> = {};
      if (filters.windowMinutes && filters.windowMinutes > 0) {
        body.time_window_minutes = Math.floor(filters.windowMinutes);
      } else if (filters.timeFilter) {
        body.time_filter = filters.timeFilter;
      }
      if (filters.hourOfDay !== undefined) body.hour_of_day = filters.hourOfDay;
      if (filters.dayOfWeek !== undefined) body.day_of_week = filters.dayOfWeek;

      const fetchStartedAt =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      const { data, error: functionError } = await supabase.functions.invoke(
        "get-location-density",
        {
          body: JSON.stringify(body),
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        },
      );
      const fetchEndedAt =
        typeof performance !== "undefined" ? performance.now() : Date.now();

      if (functionError) throw functionError;

      // Stage 2 of the sync chain: endpoint round trip. Stage 4 (end-to-end)
      // uses the freshest raw point that fed this payload so we measure true
      // Cloud-write -> map-visible latency, not just request time.
      recordMapSyncLatency("fetch", fetchEndedAt - fetchStartedAt, {
        layer: "density",
        detail: { grid_cells: data?.stats?.grid_cells ?? null },
      });
      recordEndToEndFreshness(data?.stats?.newest_point_at, {
        layer: "density",
        detail: { is_fallback: data?.stats?.is_fallback ?? null },
      });


      // Only update state if data actually changed
      const dataHash = JSON.stringify(data?.stats);
      if (dataHash !== lastDataHashRef.current) {
        lastDataHashRef.current = dataHash;
        setDensityData(data);
      }
      setError(null);
      setUnauthorized(false);
    } catch (err) {
      const status = (err as { context?: { status?: number } })?.context
        ?.status;
      if (status === 401 || status === 403) {
        console.info("Density data unavailable (admin-only endpoint).");
        setUnauthorized(true);
        setError("unauthorized");
      } else {
        console.error("Error loading density data:", err);
        setUnauthorized(false);
        setError("Failed to load density data");
      }
    } finally {
      setLoading(false);
      isLoadingRef.current = false;
      if (pendingRefetchRef.current) {
        pendingRefetchRef.current = false;
        void loadDensityData();
      }
    }
  }, [
    filters.timeFilter,
    filters.hourOfDay,
    filters.dayOfWeek,
    filters.windowMinutes,
  ]);

  const loadDensityDataRef = useRef(loadDensityData);
  loadDensityDataRef.current = loadDensityData;

  useEffect(() => {
    loadDensityData();

    // `user_locations` is not published to realtime (precise coordinates must
    // never be broadcast). The pulse subscription below gives instant updates;
    // this interval is only a safety net.
    const poll = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void loadDensityDataRef.current?.();
    }, 60000);

    return () => clearInterval(poll);
  }, [loadDensityData, instanceId]);

  // Instant refresh when new location data lands (privacy-safe heartbeat).
  useMapDataPulse(() => {
    void loadDensityDataRef.current?.();
  });


  // Refetch whenever the session changes (login / refresh / logout).
  // The callback must not await Supabase calls inline — defer to a microtask
  // so we never re-enter the auth lock from inside the listener.
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session) {
        setUnauthorized(true);
        setError("unauthorized");
        setDensityData(null);
        lastDataHashRef.current = "";
        return;
      }
      if (
        event === "SIGNED_IN" ||
        event === "TOKEN_REFRESHED" ||
        event === "INITIAL_SESSION" ||
        event === "USER_UPDATED"
      ) {
        // Force a fresh fetch on sign-in even if the payload hash is unchanged.
        setTimeout(() => {
          void loadDensityData();
        }, 0);
      }
    });
    return () => subscription.unsubscribe();
  }, [loadDensityData]);

  return {
    densityData,
    loading,
    error,
    unauthorized,
    refresh: loadDensityData,
  };
};
