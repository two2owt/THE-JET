import { useEffect, MutableRefObject } from "react";

interface Params {
  mapRef: MutableRefObject<any>;
  mapLoaded: boolean;
  isMobile: boolean;
  showDensityLayer: boolean;
  densityData: { geojson: any; stats: { grid_cells: number } } | null | undefined;
  timelapseMode: boolean;
  timelapse: { currentData: any; currentHour: number };
  heatIntensityRef: MutableRefObject<number>;
  heatRadiusRef: MutableRefObject<number>;
  heatOpacityRef: MutableRefObject<number>;
}

/**
 * Adds / removes / rebuilds the density heatmap layer set
 * (`location-density-heat` + `-point` + `-glow`) on the shared Mapbox map.
 *
 * Reads slider multipliers from refs so drag interactions don't trigger a
 * full source rebuild — {@link useDensityPaint} handles paint-only updates.
 */
export const useDensityLayer = ({
  mapRef,
  mapLoaded,
  isMobile,
  showDensityLayer,
  densityData,
  timelapseMode,
  timelapse,
  heatIntensityRef,
  heatRadiusRef,
  heatOpacityRef,
}: Params) => {
  useEffect(() => {
    const activeData = timelapseMode && timelapse.currentData
      ? timelapse.currentData
      : densityData;

    if (!mapRef.current || !mapLoaded || !activeData) return;

    const sourceId = 'location-density';
    const layerId = 'location-density-heat';
    const pointLayerId = `${layerId}-point`;
    const glowLayerId = `${layerId}-glow`;

    try {
      if (mapRef.current?.style?.loaded()) {
        [glowLayerId, pointLayerId, layerId].forEach((id) => {
          if (mapRef.current?.getLayer(id)) {
            mapRef.current.removeLayer(id);
          }
        });
        if (mapRef.current?.getSource(sourceId)) {
          mapRef.current.removeSource(sourceId);
        }
      }
    } catch (error) {
      console.error('Error removing existing layers:', error);
      return;
    }

    if (!showDensityLayer) return;

    mapRef.current.addSource(sourceId, {
      type: 'geojson',
      data: activeData.geojson,
    });

    mapRef.current.addLayer({
      id: layerId,
      type: 'heatmap',
      source: sourceId,
      paint: {
        'heatmap-weight': [
          'interpolate',
          ['exponential', 1.5],
          ['get', 'density'],
          0, 0,
          5, 0.5,
          10, 1,
        ],
        'heatmap-intensity': [
          'interpolate',
          ['exponential', 2],
          ['zoom'],
          0, (isMobile ? 2.2 : 2) * heatIntensityRef.current,
          9, (isMobile ? 2.6 : 3) * heatIntensityRef.current,
          15, (isMobile ? 4 : 5) * heatIntensityRef.current,
        ],
        'heatmap-color': [
          'interpolate',
          ['linear'],
          ['heatmap-density'],
          0, 'rgba(0, 0, 0, 0)',
          0.1, 'rgba(65, 105, 225, 0.6)',
          0.2, 'rgba(0, 191, 255, 0.8)',
          0.3, 'rgba(0, 255, 127, 0.85)',
          0.4, 'rgba(50, 205, 50, 0.9)',
          0.5, 'rgba(255, 255, 0, 0.95)',
          0.6, 'rgba(255, 215, 0, 0.95)',
          0.7, 'rgba(255, 165, 0, 1)',
          0.8, 'rgba(255, 69, 0, 1)',
          0.9, 'rgba(255, 0, 0, 1)',
          1, 'rgba(139, 0, 0, 1)',
        ],
        'heatmap-radius': [
          'interpolate',
          ['cubic-bezier', 0.4, 0, 0.2, 1],
          ['zoom'],
          0,  (isMobile ? 26 : 20) * heatRadiusRef.current,
          5,  (isMobile ? 38 : 30) * heatRadiusRef.current,
          9,  (isMobile ? 60 : 50) * heatRadiusRef.current,
          11, (isMobile ? 72 : 60) * heatRadiusRef.current,
          12, (isMobile ? 82 : 70) * heatRadiusRef.current,
          13, (isMobile ? 94 : 80) * heatRadiusRef.current,
          15, (isMobile ? 115 : 100) * heatRadiusRef.current,
          17, (isMobile ? 130 : 115) * heatRadiusRef.current,
        ],
        'heatmap-opacity': [
          'interpolate',
          ['cubic-bezier', 0.4, 0, 0.2, 1],
          ['zoom'],
          5,  (isMobile ? 0.85 : 1)    * heatOpacityRef.current,
          7,  (isMobile ? 0.82 : 0.95) * heatOpacityRef.current,
          10, (isMobile ? 0.8  : 0.92) * heatOpacityRef.current,
          12, (isMobile ? 0.78 : 0.9)  * heatOpacityRef.current,
          14, (isMobile ? 0.74 : 0.87) * heatOpacityRef.current,
          15, (isMobile ? 0.7  : 0.85) * heatOpacityRef.current,
          17, (isMobile ? 0.6  : 0.75) * heatOpacityRef.current,
        ],
        'heatmap-radius-transition': { duration: 450, delay: 0 },
        'heatmap-opacity-transition': { duration: 600, delay: 0 },
      } as any,
    });

    mapRef.current.addLayer({
      id: `${layerId}-point`,
      type: 'circle',
      source: sourceId,
      minzoom: 13,
      paint: {
        'circle-radius': [
          'interpolate',
          ['exponential', 1.5],
          ['get', 'density'],
          0, 5,
          5, 12,
          10, 25,
        ],
        'circle-color': [
          'interpolate',
          ['linear'],
          ['get', 'density'],
          0, 'rgb(65, 105, 225)',
          3, 'rgb(0, 255, 127)',
          6, 'rgb(255, 215, 0)',
          8, 'rgb(255, 69, 0)',
          10, 'rgb(139, 0, 0)',
        ],
        'circle-opacity': 0.7,
        'circle-blur': 0.3,
        'circle-stroke-width': 2,
        'circle-stroke-color': [
          'interpolate',
          ['linear'],
          ['get', 'density'],
          0, 'rgba(255, 255, 255, 0.6)',
          10, 'rgba(255, 255, 255, 0.9)',
        ],
        'circle-stroke-opacity': 0.8,
        'circle-opacity-transition': { duration: 1000, delay: 100 },
      } as any,
    });

    mapRef.current.addLayer({
      id: `${layerId}-glow`,
      type: 'circle',
      source: sourceId,
      minzoom: 13,
      paint: {
        'circle-radius': [
          'interpolate',
          ['exponential', 1.5],
          ['get', 'density'],
          0, 10,
          5, 20,
          10, 40,
        ],
        'circle-color': [
          'interpolate',
          ['linear'],
          ['get', 'density'],
          0, 'rgba(65, 105, 225, 0.3)',
          5, 'rgba(255, 215, 0, 0.4)',
          10, 'rgba(255, 0, 0, 0.5)',
        ],
        'circle-opacity': 0.3,
        'circle-blur': 1,
        'circle-opacity-transition': { duration: 1000, delay: 200 },
      } as any,
    });

    console.log(
      'Density heatmap layer added with',
      activeData.stats.grid_cells,
      'points',
      timelapseMode ? `(hour ${timelapse.currentHour})` : ''
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapLoaded, densityData, showDensityLayer, timelapseMode, timelapse.currentData, timelapse.currentHour, isMobile]);
};