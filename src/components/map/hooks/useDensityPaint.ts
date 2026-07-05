import { useEffect, MutableRefObject } from "react";

interface Params {
  mapRef: MutableRefObject<any>;
  mapLoaded: boolean;
  isMobile: boolean;
  showDensityLayer: boolean;
  densityData: any;
  timelapseMode: boolean;
  timelapseCurrentData: any;
  heatIntensity: number;
  heatRadius: number;
  heatOpacity: number;
}

/**
 * Paint-only slider updates for the density heatmap layer — uses
 * `setPaintProperty` so drag interactions never trigger a source rebuild.
 */
export const useDensityPaint = ({
  mapRef,
  mapLoaded,
  isMobile,
  showDensityLayer,
  densityData,
  timelapseMode,
  timelapseCurrentData,
  heatIntensity,
  heatRadius,
  heatOpacity,
}: Params) => {
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !mapLoaded) return;
    const layerId = 'location-density-heat';
    try {
      if (!m.getLayer(layerId)) return;
      m.setPaintProperty(layerId, 'heatmap-intensity', [
        'interpolate',
        ['exponential', 2],
        ['zoom'],
        0, (isMobile ? 2.2 : 2) * heatIntensity,
        9, (isMobile ? 2.6 : 3) * heatIntensity,
        15, (isMobile ? 4 : 5) * heatIntensity,
      ]);
      m.setPaintProperty(layerId, 'heatmap-radius', [
        'interpolate',
        ['cubic-bezier', 0.4, 0, 0.2, 1],
        ['zoom'],
        0,  (isMobile ? 26 : 20) * heatRadius,
        5,  (isMobile ? 38 : 30) * heatRadius,
        9,  (isMobile ? 60 : 50) * heatRadius,
        11, (isMobile ? 72 : 60) * heatRadius,
        12, (isMobile ? 82 : 70) * heatRadius,
        13, (isMobile ? 94 : 80) * heatRadius,
        15, (isMobile ? 115 : 100) * heatRadius,
        17, (isMobile ? 130 : 115) * heatRadius,
      ]);
      m.setPaintProperty(layerId, 'heatmap-opacity', [
        'interpolate',
        ['cubic-bezier', 0.4, 0, 0.2, 1],
        ['zoom'],
        5,  (isMobile ? 0.85 : 1)    * heatOpacity,
        7,  (isMobile ? 0.82 : 0.95) * heatOpacity,
        10, (isMobile ? 0.8  : 0.92) * heatOpacity,
        12, (isMobile ? 0.78 : 0.9)  * heatOpacity,
        14, (isMobile ? 0.74 : 0.87) * heatOpacity,
        15, (isMobile ? 0.7  : 0.85) * heatOpacity,
        17, (isMobile ? 0.6  : 0.75) * heatOpacity,
      ]);
    } catch {
      // Layer may be mid-rebuild; useDensityLayer will pick up the current
      // ref values on its next run.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heatIntensity, heatRadius, heatOpacity, mapLoaded, isMobile, showDensityLayer, densityData, timelapseMode, timelapseCurrentData]);
};