import { useEffect } from "react";

/**
 * Persists all layer toggles, filter selections, and heatmap paint sliders to
 * localStorage. One hook so the container isn't littered with 15 tiny
 * effects — behavior is identical to the previous inline effects.
 */
interface Params {
  layerKeys: Record<string, string>;
  filterKeys: Record<string, string>;
  showDensityLayer: boolean;
  showMovementPaths: boolean;
  showParking: boolean;
  showLiveStats: boolean;
  timeFilter: string;
  pathTimeFilter: string;
  dayFilter: number | undefined;
  timelapseMode: boolean;
  pathsWindowMinutes: number | null;
}

export const useLayerPersistence = ({
  layerKeys,
  filterKeys,
  showDensityLayer,
  showMovementPaths,
  showParking,
  showLiveStats,
  timeFilter,
  pathTimeFilter,
  dayFilter,
  timelapseMode,
  pathsWindowMinutes,
}: Params) => {
  useEffect(() => { localStorage.setItem(layerKeys.density, String(showDensityLayer)); }, [layerKeys.density, showDensityLayer]);
  useEffect(() => { localStorage.setItem(layerKeys.paths, String(showMovementPaths)); }, [layerKeys.paths, showMovementPaths]);
  useEffect(() => { localStorage.setItem(layerKeys.parking, String(showParking)); }, [layerKeys.parking, showParking]);
  useEffect(() => { localStorage.setItem(layerKeys.stats, String(showLiveStats)); }, [layerKeys.stats, showLiveStats]);

  useEffect(() => { localStorage.setItem(filterKeys.timeFilter, timeFilter); }, [filterKeys.timeFilter, timeFilter]);
  useEffect(() => { localStorage.setItem(filterKeys.pathTimeFilter, pathTimeFilter); }, [filterKeys.pathTimeFilter, pathTimeFilter]);
  useEffect(() => { localStorage.setItem(filterKeys.dayFilter, dayFilter === undefined ? "all" : String(dayFilter)); }, [filterKeys.dayFilter, dayFilter]);
  useEffect(() => { localStorage.setItem(filterKeys.timelapseMode, String(timelapseMode)); }, [filterKeys.timelapseMode, timelapseMode]);

  useEffect(() => {
    localStorage.setItem(filterKeys.pathsWindow, pathsWindowMinutes === null ? "off" : String(pathsWindowMinutes));
  }, [filterKeys.pathsWindow, pathsWindowMinutes]);
};