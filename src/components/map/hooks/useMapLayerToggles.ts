import { useCallback } from "react";
import type * as MapboxGL from "mapbox-gl";
import { triggerHaptic } from "@/lib/haptics";
import {
  clearPersistedLayerState,
  clearPersistedLayerUrl,
} from "../layerPersistence";

export type MapTimeFilter = "all" | "today" | "this_week" | "this_hour";

type Setter<T> = React.Dispatch<React.SetStateAction<T>>;

/** The slice of the time-lapse hook the toggles need. */
type TimelapseControls = {
  isPlaying: boolean;
  pause: () => void;
  setSpeed: (speed: number) => void;
  setHour: (hour: number) => void;
  loadHourlyData: () => void;
};

export type MapLayerToggleDeps = {
  mapRef: React.MutableRefObject<MapboxGL.Map | null>;
  timelapse: TimelapseControls;
  /** localStorage keys for persisted filter / time-lapse settings. */
  filterKeys: Record<string, string>;

  setShowDensityLayer: Setter<boolean>;
  setShowMovementPaths: Setter<boolean>;
  setShowParking: Setter<boolean>;
  setShowLiveStats: Setter<boolean>;
  setTimelapseMode: Setter<boolean>;
  setIsLoadingHeatmap: Setter<boolean>;
  setIsLoadingPaths: Setter<boolean>;
  setIsLoadingStats: Setter<boolean>;
  setTimeFilter: Setter<MapTimeFilter>;
  setPathTimeFilter: Setter<MapTimeFilter>;
  setHourFilter: Setter<number | undefined>;
  setDayFilter: Setter<number | undefined>;
  setMinPathFrequency: Setter<number>;
  setPathsWindowMinutes: Setter<number | null>;

  scheduleDensityRefresh: () => void;
  clearDensityRefreshTimer: () => void;
  schedulePathsRefresh: () => void;
  clearPathsRefreshTimer: () => void;
};

export type MapLayerToggles = {
  applyDensityLayer: (next: boolean) => void;
  applyPathsLayer: (next: boolean) => void;
  applyParkingLayer: (next: boolean) => void;
  applyLiveStats: (next: boolean) => void;
  applyTimelapse: (next: boolean) => void;
  handleResetToDefaults: () => void;
};

/**
 * Unified layer-toggle intents.
 *
 * Every surface that can flip a layer (Layers panel rows, collapsed
 * quick-toggle chips, the Time-lapse pill) routes through these, so the
 * dependency cascade can never disagree between entry points.
 *
 * Rules:
 *   • Heatmap off   → Time-lapse off, Live Stats off (both feed off it).
 *   • Flow Paths on → Time-lapse off (they fight for the same channel).
 *   • Flow Paths off→ Live Stats off (stats needs the paths series).
 *   • Live Stats on → Heatmap + Flow Paths on.
 *   • Time-lapse on → Heatmap on, Flow Paths off (⇒ Live Stats off).
 */
export const useMapLayerToggles = (deps: MapLayerToggleDeps): MapLayerToggles => {
  const {
    mapRef,
    timelapse,
    filterKeys,
    setShowDensityLayer,
    setShowMovementPaths,
    setShowParking,
    setShowLiveStats,
    setTimelapseMode,
    setIsLoadingHeatmap,
    setIsLoadingPaths,
    setIsLoadingStats,
    setTimeFilter,
    setPathTimeFilter,
    setHourFilter,
    setDayFilter,
    setMinPathFrequency,
    setPathsWindowMinutes,
    scheduleDensityRefresh,
    clearDensityRefreshTimer,
    schedulePathsRefresh,
    clearPathsRefreshTimer,
  } = deps;

  const applyDensityLayer = useCallback(
    (next: boolean) => {
      setShowDensityLayer(next);
      if (next) {
        setTimeFilter("all");
        setHourFilter(undefined);
        setDayFilter(undefined);
        scheduleDensityRefresh();
      } else {
        clearDensityRefreshTimer();
        setIsLoadingHeatmap(false);
        setTimelapseMode(false);
        setShowLiveStats(false);
        setIsLoadingStats(false);
      }
    },
    [
      scheduleDensityRefresh,
      clearDensityRefreshTimer,
      setShowDensityLayer,
      setTimeFilter,
      setHourFilter,
      setDayFilter,
      setIsLoadingHeatmap,
      setTimelapseMode,
      setShowLiveStats,
      setIsLoadingStats,
    ],
  );

  const applyPathsLayer = useCallback(
    (next: boolean) => {
      setShowMovementPaths(next);
      if (next) {
        setTimelapseMode(false);
        schedulePathsRefresh();
      } else {
        clearPathsRefreshTimer();
        setIsLoadingPaths(false);
        setShowLiveStats(false);
        setIsLoadingStats(false);
      }
    },
    [
      schedulePathsRefresh,
      clearPathsRefreshTimer,
      setShowMovementPaths,
      setTimelapseMode,
      setIsLoadingPaths,
      setShowLiveStats,
      setIsLoadingStats,
    ],
  );

  const applyParkingLayer = useCallback(
    (next: boolean) => {
      setShowParking(next);
      try {
        if (mapRef.current?.getLayer("parking-icons")) {
          mapRef.current.setLayoutProperty(
            "parking-icons",
            "visibility",
            next ? "visible" : "none",
          );
        }
      } catch {
        /* layer may not exist yet */
      }
    },
    [mapRef, setShowParking],
  );

  const applyLiveStats = useCallback(
    (next: boolean) => {
      setShowLiveStats(next);
      if (next) {
        setIsLoadingStats(true);
        applyDensityLayer(true);
        applyPathsLayer(true);
        // Both "on" paths above never clear stats, but paths-on also drops
        // Time-lapse, which is the intended mutual exclusion.
        setShowLiveStats(true);
      } else {
        setIsLoadingStats(false);
      }
    },
    [applyDensityLayer, applyPathsLayer, setShowLiveStats, setIsLoadingStats],
  );

  const applyTimelapse = useCallback(
    (next: boolean) => {
      if (next) {
        applyDensityLayer(true);
        applyPathsLayer(false);
        setTimelapseMode(true);
        timelapse.loadHourlyData();
      } else {
        setTimelapseMode(false);
      }
    },
    [applyDensityLayer, applyPathsLayer, setTimelapseMode, timelapse],
  );

  /** Clears persisted state and restores factory settings. */
  const handleResetToDefaults = useCallback(() => {
    triggerHaptic("medium");

    // Order matters: wipe every source of persisted state BEFORE resetting
    // React state. If we reset state first, the persistence effects fire with
    // the new defaults and race with the localStorage clear — and any early
    // return / thrown error would leave stale entries behind that would
    // resurrect on the next refresh.
    //
    // 1. URL first — it has read-priority over localStorage on next boot.
    clearPersistedLayerUrl();
    // 2. Persisted layer toggles.
    clearPersistedLayerState();
    // 3. Persisted filter / time-lapse settings.
    Object.values(filterKeys).forEach((key) => {
      try {
        localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    });

    setShowDensityLayer(false);
    setShowParking(false);
    setShowLiveStats(false);
    setShowMovementPaths(false);
    setTimeFilter("all");
    setPathTimeFilter("all");
    setDayFilter(undefined);
    setHourFilter(undefined);
    setTimelapseMode(false);
    setMinPathFrequency(2);
    // Reset data-window slider to its default.
    setPathsWindowMinutes(null);

    // Reset time-lapse playback.
    if (timelapse.isPlaying) timelapse.pause();
    timelapse.setSpeed(1);
    timelapse.setHour(new Date().getHours());
  }, [
    filterKeys,
    timelapse,
    setShowDensityLayer,
    setShowParking,
    setShowLiveStats,
    setShowMovementPaths,
    setTimeFilter,
    setPathTimeFilter,
    setDayFilter,
    setHourFilter,
    setTimelapseMode,
    setMinPathFrequency,
    setPathsWindowMinutes,
  ]);

  return {
    applyDensityLayer,
    applyPathsLayer,
    applyParkingLayer,
    applyLiveStats,
    applyTimelapse,
    handleResetToDefaults,
  };
};
