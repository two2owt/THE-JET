import { useEffect, MutableRefObject } from "react";
import type * as MapboxGL from "mapbox-gl";

type MapboxGLModule = typeof import("mapbox-gl").default;

interface PlatformSettings {
  hasReducedMotion: boolean;
  isLowPowerMode: boolean;
}

interface Params {
  mapRef: MutableRefObject<any>;
  mapboxglRef: MutableRefObject<MapboxGLModule | null>;
  mapLoaded: boolean;
  showMovementPaths: boolean;
  pathData: { geojson: any; stats: { total_paths: number } } | null | undefined;
  flowAnimationRef: MutableRefObject<number | null>;
  platformSettingsRef: MutableRefObject<PlatformSettings>;
}

/**
 * Builds / animates / tears down the movement-paths layer stack
 * (glow + line + arrows + particles) and its rAF flow animation.
 */
export const useMovementPathsLayer = ({
  mapRef,
  mapboxglRef,
  mapLoaded,
  showMovementPaths,
  pathData,
  flowAnimationRef,
  platformSettingsRef,
}: Params) => {
  useEffect(() => {
    if (flowAnimationRef.current) {
      cancelAnimationFrame(flowAnimationRef.current);
      flowAnimationRef.current = null;
    }

    if (!mapRef.current || !mapLoaded || !pathData) return;

    const sourceId = 'movement-paths';
    const lineLayerId = 'movement-paths-line';
    const glowLayerId = 'movement-paths-glow';
    const arrowLayerId = 'movement-paths-arrows';
    const particleLayerId = 'movement-paths-particles';

    try {
      [particleLayerId, arrowLayerId, glowLayerId, lineLayerId].forEach((id) => {
        try {
          if (mapRef.current?.getLayer(id)) {
            mapRef.current.removeLayer(id);
          }
        } catch (_) { /* no-op */ }
      });
      try {
        if (mapRef.current?.getSource(sourceId)) {
          mapRef.current.removeSource(sourceId);
        }
      } catch (_) { /* no-op */ }
      try {
        if (mapRef.current?.getSource(`${sourceId}-particles`)) {
          mapRef.current.removeSource(`${sourceId}-particles`);
        }
      } catch (_) { /* no-op */ }
    } catch (error) {
      console.error('Error removing existing movement path layers:', error);
      return;
    }

    if (!showMovementPaths) return;

    const existing = mapRef.current.getSource(sourceId) as any;
    if (existing) {
      try { existing.setData(pathData.geojson); } catch (_) { /* no-op */ }
    } else {
      mapRef.current.addSource(sourceId, {
        type: 'geojson',
        data: pathData.geojson,
        lineMetrics: true,
      });
    }

    mapRef.current.addLayer({
      id: glowLayerId,
      type: 'line',
      source: sourceId,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-width': [
          'interpolate', ['exponential', 1.5], ['get', 'frequency'],
          1, 8, 5, 14, 10, 22, 20, 30,
        ],
        'line-color': [
          'interpolate', ['linear'], ['get', 'frequency'],
          1, 'rgba(100, 200, 255, 0.3)',
          5, 'rgba(0, 255, 255, 0.35)',
          10, 'rgba(255, 200, 0, 0.4)',
          15, 'rgba(255, 100, 0, 0.45)',
          20, 'rgba(255, 0, 100, 0.5)',
        ],
        'line-blur': 4,
        'line-opacity': 0.6,
      } as any,
    });

    mapRef.current.addLayer({
      id: lineLayerId,
      type: 'line',
      source: sourceId,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-width': [
          'interpolate', ['exponential', 1.5], ['get', 'frequency'],
          1, 3, 5, 6, 10, 10, 20, 14,
        ],
        'line-color': [
          'interpolate', ['linear'], ['get', 'frequency'],
          1, 'rgb(100, 200, 255)',
          5, 'rgb(0, 255, 255)',
          10, 'rgb(255, 200, 0)',
          15, 'rgb(255, 100, 0)',
          20, 'rgb(255, 0, 100)',
        ],
        'line-opacity': 0.9,
        'line-dasharray': [0, 4, 3],
      } as any,
    });

    if (!mapRef.current.hasImage('flow-arrow')) {
      const size = 48;
      const arrowCanvas = document.createElement('canvas');
      arrowCanvas.width = size;
      arrowCanvas.height = size;
      const ctx = arrowCanvas.getContext('2d')!;
      const gradient = ctx.createLinearGradient(0, 0, size, 0);
      gradient.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
      gradient.addColorStop(0.5, 'rgba(255, 255, 255, 1)');
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0.4)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(size * 0.2, size * 0.3);
      ctx.lineTo(size * 0.6, size * 0.5);
      ctx.lineTo(size * 0.2, size * 0.7);
      ctx.lineTo(size * 0.35, size * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
      ctx.shadowBlur = 8;
      ctx.fill();
      mapRef.current.addImage('flow-arrow', {
        width: size,
        height: size,
        data: ctx.getImageData(0, 0, size, size).data as any,
      });
    }

    mapRef.current.addLayer({
      id: arrowLayerId,
      type: 'symbol',
      source: sourceId,
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': 40,
        'icon-image': 'flow-arrow',
        'icon-size': [
          'interpolate', ['linear'], ['get', 'frequency'],
          1, 0.6, 10, 0.9, 20, 1.2,
        ],
        'icon-rotate': 90,
        'icon-rotation-alignment': 'map',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      } as any,
      paint: { 'icon-opacity': 0.85 } as any,
    });

    const createParticleData = (offset: number) => {
      const particles: any[] = [];
      pathData.geojson.features.forEach((feature: any) => {
        if (feature.geometry.type === 'LineString') {
          const coords = feature.geometry.coordinates;
          const frequency = feature.properties?.frequency || 1;
          const numParticles = Math.min(Math.ceil(frequency / 3), 5);
          for (let p = 0; p < numParticles; p++) {
            const t = ((offset / 100) + (p / numParticles)) % 1;
            if (coords.length >= 2) {
              const segmentCount = coords.length - 1;
              const segmentIndex = Math.floor(t * segmentCount);
              const segmentT = (t * segmentCount) - segmentIndex;
              const start = coords[Math.min(segmentIndex, coords.length - 2)];
              const end = coords[Math.min(segmentIndex + 1, coords.length - 1)];
              const lng = start[0] + (end[0] - start[0]) * segmentT;
              const lat = start[1] + (end[1] - start[1]) * segmentT;
              particles.push({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [lng, lat] },
                properties: { frequency, particleIndex: p },
              });
            }
          }
        }
      });
      return { type: 'FeatureCollection' as const, features: particles };
    };

    mapRef.current.addSource(`${sourceId}-particles`, {
      type: 'geojson',
      data: createParticleData(0),
    });

    mapRef.current.addLayer({
      id: particleLayerId,
      type: 'circle',
      source: `${sourceId}-particles`,
      paint: {
        'circle-radius': [
          'interpolate', ['linear'], ['get', 'frequency'],
          1, 4, 10, 7, 20, 10,
        ],
        'circle-color': [
          'interpolate', ['linear'], ['get', 'frequency'],
          1, 'rgb(150, 220, 255)',
          5, 'rgb(100, 255, 255)',
          10, 'rgb(255, 230, 100)',
          15, 'rgb(255, 150, 50)',
          20, 'rgb(255, 80, 150)',
        ],
        'circle-opacity': 0.9,
        'circle-blur': 0.3,
        'circle-stroke-width': 2,
        'circle-stroke-color': 'rgba(255, 255, 255, 0.8)',
      } as any,
    });

    const dashArraySequence = [
      [0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5],
      [2, 4, 1], [2.5, 4, 0.5], [3, 4, 0],
      [0, 0.5, 3, 3.5], [0, 1, 3, 3], [0, 1.5, 3, 2.5],
      [0, 2, 3, 2], [0, 2.5, 3, 1.5], [0, 3, 3, 1], [0, 3.5, 3, 0.5],
    ];

    let step = 0;
    let particleOffset = 0;
    let lastTime = performance.now();

    const animateFlow = (currentTime: number) => {
      const settings = platformSettingsRef.current;
      if (!mapRef.current || !showMovementPaths || document.hidden || settings.hasReducedMotion || settings.isLowPowerMode) {
        flowAnimationRef.current = null;
        return;
      }
      const deltaTime = currentTime - lastTime;
      if (deltaTime > 80) {
        step = (step + 1) % dashArraySequence.length;
        if (mapRef.current.getLayer(lineLayerId)) {
          mapRef.current.setPaintProperty(lineLayerId, 'line-dasharray', dashArraySequence[step]);
        }
        particleOffset = (particleOffset + 2) % 100;
        const particleSource = mapRef.current.getSource(`${sourceId}-particles`);
        if (particleSource) {
          particleSource.setData(createParticleData(particleOffset));
        }
        lastTime = currentTime;
      }
      flowAnimationRef.current = requestAnimationFrame(animateFlow);
    };

    flowAnimationRef.current = requestAnimationFrame(animateFlow);

    console.log('Movement paths layer added with', pathData.stats.total_paths, 'paths and animated particles');

    // Click-to-inspect popup: show trip count + unique users for the
    // clicked flow segment. Hover swaps the cursor to a pointer so users
    // discover the interaction. Interactive layers include the wide glow
    // line so thin high-traffic paths remain easy to hit on touch.
    const map = mapRef.current;
    const mapboxgl = mapboxglRef.current;
    let activePopup: MapboxGL.Popup | null = null;
    const interactiveLayers = [glowLayerId, lineLayerId];

    const onEnter = () => { if (map) map.getCanvas().style.cursor = 'pointer'; };
    const onLeave = () => { if (map) map.getCanvas().style.cursor = ''; };
    const onClick = (e: any) => {
      if (!map || !mapboxgl) return;
      const feature = e.features?.[0];
      if (!feature) return;
      const frequency = Number(feature.properties?.frequency ?? 0);
      const uniqueUsers = Number(feature.properties?.unique_users ?? 0);
      const tripsPerUser = uniqueUsers > 0 ? (frequency / uniqueUsers).toFixed(1) : '—';
      const html = `
        <div style="font-family: inherit; padding: 4px 2px; min-width: 140px;">
          <div style="font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: hsl(var(--muted-foreground)); margin-bottom: 6px;">Flow segment</div>
          <div style="display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin-bottom: 3px;">
            <span style="font-size: 11px; color: hsl(var(--muted-foreground));">Trips</span>
            <span style="font-size: 14px; font-weight: 700; color: hsl(var(--foreground));">${frequency.toLocaleString()}</span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin-bottom: 3px;">
            <span style="font-size: 11px; color: hsl(var(--muted-foreground));">Unique users</span>
            <span style="font-size: 14px; font-weight: 700; color: hsl(var(--foreground));">${uniqueUsers.toLocaleString()}</span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: baseline; gap: 12px;">
            <span style="font-size: 11px; color: hsl(var(--muted-foreground));">Trips / user</span>
            <span style="font-size: 14px; font-weight: 700; color: hsl(var(--primary));">${tripsPerUser}</span>
          </div>
        </div>
      `;
      if (activePopup) activePopup.remove();
      activePopup = new mapboxgl.Popup({ closeButton: true, offset: 12, className: 'flow-path-popup' })
        .setLngLat(e.lngLat)
        .setHTML(html)
        .addTo(map);
    };

    interactiveLayers.forEach((id) => {
      map.on('mouseenter', id, onEnter);
      map.on('mouseleave', id, onLeave);
      map.on('click', id, onClick);
    });

    return () => {
      if (flowAnimationRef.current) {
        cancelAnimationFrame(flowAnimationRef.current);
        flowAnimationRef.current = null;
      }
      try {
        interactiveLayers.forEach((id) => {
          map?.off('mouseenter', id, onEnter);
          map?.off('mouseleave', id, onLeave);
          map?.off('click', id, onClick);
        });
      } catch { /* map may be torn down */ }
      if (activePopup) { try { activePopup.remove(); } catch { /* no-op */ } activePopup = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapLoaded, pathData, showMovementPaths]);
};