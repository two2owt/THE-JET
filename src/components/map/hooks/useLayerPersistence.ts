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
  openNowOnly: boolean;
  timeFilter: string;
  pathTimeFilter: string;
  dayFilter: number | undefined;
  timelapseMode: boolean;
  heatIntensity: number;
  heatRadius: number;
  heatOpacity: number;
  densityWindowMinutes: number | null;
  pathsWindowMinutes: number | null;
}

export const useLayerPersistence = ({
  layerKeys,
  filterKeys,
  showDensityLayer,
  showMovementPaths,
  showParking,
  showLiveStats,
  openNowOnly,
  timeFilter,
  pathTimeFilter,
  dayFilter,
  timelapseMode,
  heatIntensity,
  heatRadius,
  heatOpacity,
  densityWindowMinutes,
  pathsWindowMinutes,
}: Params) => {
  useEffect(() => { localStorage.setItem(layerKeys.density, String(showDensityLayer)); }, [layerKeys.density, showDensityLayer]);
  useEffect(() => { localStorage.setItem(layerKeys.paths, String(showMovementPaths)); }, [layerKeys.paths, showMovementPaths]);
  useEffect(() => { localStorage.setItem(layerKeys.parking, String(showParking)); }, [layerKeys.parking, showParking]);
  useEffect(() => { localStorage.setItem(layerKeys.stats, String(showLiveStats)); }, [layerKeys.stats, showLiveStats]);
  useEffect(() => { localStorage.setItem(layerKeys.openNow, String(openNowOnly)); }, [layerKeys.openNow, openNowOnly]);

  useEffect(() => { localStorage.setItem(filterKeys.timeFilter, timeFilter); }, [filterKeys.timeFilter, timeFilter]);
  useEffect(() => { localStorage.setItem(filterKeys.pathTimeFilter, pathTimeFilter); }, [filterKeys.pathTimeFilter, pathTimeFilter]);
  useEffect(() => { localStorage.setItem(filterKeys.dayFilter, dayFilter === undefined ? "all" : String(dayFilter)); }, [filterKeys.dayFilter, dayFilter]);
  useEffect(() => { localStorage.setItem(filterKeys.timelapseMode, String(timelapseMode)); }, [filterKeys.timelapseMode, timelapseMode]);

  useEffect(() => { localStorage.setItem(filterKeys.heatIntensity, String(heatIntensity)); }, [filterKeys.heatIntensity, heatIntensity]);
  useEffect(() => { localStorage.setItem(filterKeys.heatRadius, String(heatRadius)); }, [filterKeys.heatRadius, heatRadius]);
  useEffect(() => { localStorage.setItem(filterKeys.heatOpacity, String(heatOpacity)); }, [filterKeys.heatOpacity, heatOpacity]);
  useEffect(() => {
    localStorage.setItem(filterKeys.densityWindow, densityWindowMinutes === null ? "off" : String(densityWindowMinutes));
  }, [filterKeys.densityWindow, densityWindowMinutes]);
  useEffect(() => {
    localStorage.setItem(filterKeys.pathsWindow, pathsWindowMinutes === null ? "off" : String(pathsWindowMinutes));
  }, [filterKeys.pathsWindow, pathsWindowMinutes]);
};