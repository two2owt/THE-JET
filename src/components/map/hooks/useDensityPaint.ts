import { useEffect, useRef, MutableRefObject } from "react";

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
  // Coalesce rapid slider updates into one paint per frame so dragging
  // never triggers back-to-back `setPaintProperty` calls in the same tick.
  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef({ heatIntensity, heatRadius, heatOpacity });

  useEffect(() => {
    pendingRef.current = { heatIntensity, heatRadius, heatOpacity };
    const m = mapRef.current;
    if (!m || !mapLoaded) return;
    const layerId = 'location-density-heat';

    const apply = () => {
      rafRef.current = null;
      const map = mapRef.current;
      if (!map) return;
      const { heatIntensity: hi, heatRadius: hr, heatOpacity: ho } = pendingRef.current;
      try {
        if (!map.getLayer(layerId)) return;
        map.setPaintProperty(layerId, 'heatmap-intensity', [
        'interpolate',
        ['exponential', 2],
        ['zoom'],
          0, (isMobile ? 2.2 : 2) * hi,
          9, (isMobile ? 2.6 : 3) * hi,
          15, (isMobile ? 4 : 5) * hi,
        ]);
        map.setPaintProperty(layerId, 'heatmap-radius', [
        'interpolate',
        ['cubic-bezier', 0.4, 0, 0.2, 1],
        ['zoom'],
          0,  (isMobile ? 26 : 20) * hr,
          5,  (isMobile ? 38 : 30) * hr,
          9,  (isMobile ? 60 : 50) * hr,
          11, (isMobile ? 72 : 60) * hr,
          12, (isMobile ? 82 : 70) * hr,
          13, (isMobile ? 94 : 80) * hr,
          15, (isMobile ? 115 : 100) * hr,
          17, (isMobile ? 130 : 115) * hr,
        ]);
        map.setPaintProperty(layerId, 'heatmap-opacity', [
        'interpolate',
        ['cubic-bezier', 0.4, 0, 0.2, 1],
        ['zoom'],
          5,  (isMobile ? 0.85 : 1)    * ho,
          7,  (isMobile ? 0.82 : 0.95) * ho,
          10, (isMobile ? 0.8  : 0.92) * ho,
          12, (isMobile ? 0.78 : 0.9)  * ho,
          14, (isMobile ? 0.74 : 0.87) * ho,
          15, (isMobile ? 0.7  : 0.85) * ho,
          17, (isMobile ? 0.6  : 0.75) * ho,
        ]);
      } catch {
        // Layer may be mid-rebuild; useDensityLayer will pick up the
        // current ref values on its next run.
      }
    };

    if (rafRef.current == null) {
      rafRef.current = requestAnimationFrame(apply);
    }

    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heatIntensity, heatRadius, heatOpacity, mapLoaded, isMobile, showDensityLayer, densityData, timelapseMode, timelapseCurrentData]);
};