import { devLog } from "@/lib/log";
import { useEffect, useRef, useState, MutableRefObject } from "react";

/** How long to coalesce rapid path updates before touching Mapbox (ms). */
const PATH_UPDATE_DEBOUNCE_MS = 250;

/**
 * Decay window: a route observed right now renders at full strength, and
 * fades linearly to `DECAY_MIN_OPACITY` once it has gone unobserved for
 * `DECAY_WINDOW_MINUTES`. Routes with no `last_seen` are treated as fresh.
 */
const DECAY_WINDOW_MINUTES = 60;
const DECAY_MIN_OPACITY = 0.12;
/** How often the decay factor is recomputed against the wall clock. */
const DECAY_TICK_MS = 20000;

/** Returns 0..1 freshness for a route based on when it was last observed. */
const recencyFactor = (lastSeen: string | null | undefined) => {
  if (!lastSeen) return 1;
  const ts = new Date(lastSeen).getTime();
  if (!Number.isFinite(ts)) return 1;
  const ageMin = Math.max(0, (Date.now() - ts) / 60000);
  const decayed = 1 - ageMin / DECAY_WINDOW_MINUTES;
  return Math.min(1, Math.max(DECAY_MIN_OPACITY, decayed));
};

/**
 * Stamps every feature with a `recency` property so paint expressions can
 * multiply frequency-driven styling by how fresh the movement is.
 */
const withDecay = (geojson: any) => {
  if (!geojson?.features) return geojson;
  return {
    ...geojson,
    features: geojson.features.map((f: any) => ({
      ...f,
      properties: {
        ...(f.properties || {}),
        recency: recencyFactor(f.properties?.last_seen),
      },
    })),
  };
};

interface PlatformSettings {
  hasReducedMotion: boolean;
  isLowPowerMode: boolean;
}

/** Mapbox filter for routes that are currently selected (animated). */
const activeFilter = (min: number): any => [
  ">=",
  ["coalesce", ["get", "frequency"], 0],
  min,
];
/** Mapbox filter for routes below the current selection (static). */
const inactiveFilter = (min: number): any => [
  "<",
  ["coalesce", ["get", "frequency"], 0],
  min,
];

/** Dash phases used to make the flow lines appear to travel. */
// Long dashes with short gaps: the stroke still reads as one continuous
// route (legible when zoomed out) while the offset animation conveys
// direction of travel.
/**
 * Elevated-line config (GL JS v3.19+): draws flow paths as ground-referenced
 * 3D lines lifted a few metres above the terrain/road surface so they are not
 * z-fought by terrain or buried under extruded buildings. `line-occlusion-opacity`
 * keeps a ghost of the route visible where a building still covers it.
 */
export const FLOW_LINE_ELEVATION_LAYOUT = {
  "line-elevation-reference": "ground",
  // Lift more as you zoom in (buildings get taller on screen).
  "line-z-offset": [
    "interpolate",
    ["linear"],
    ["zoom"],
    9,
    0,
    13,
    4,
    16,
    14,
    18,
    26,
  ],
} as any;

/** Ghost-through-buildings opacity for elevated flow lines. */
const OCCLUSION_OPACITY = 0.45;

const DASH_SEQUENCE = [
  [0, 6, 1.5],
  [0.25, 6, 1.25],
  [0.5, 6, 1],
  [0.75, 6, 0.75],
  [1, 6, 0.5],
  [1.25, 6, 0.25],
  [1.5, 6, 0],
  [0, 0.25, 6, 1.25],
  [0, 0.5, 6, 1],
  [0, 0.75, 6, 0.75],
  [0, 1, 6, 0.5],
  [0, 1.25, 6, 0.25],
  [0, 1.5, 6, 0],
];

/**
 * Builds the moving particle FeatureCollection for a given path GeoJSON at a
 * travel offset (0..100). Module-level so the animation loop can run from the
 * latest data without being rebuilt every time paths refresh.
 */
const buildParticleData = (geojson: any, offset: number, minFrequency = 0) => {
  const particles: any[] = [];
  (geojson?.features ?? []).forEach((feature: any) => {
    if (feature.geometry?.type !== "LineString") return;
    const coords = feature.geometry.coordinates;
    const frequency = feature.properties?.frequency || 1;
    // Only routes that are currently selected (>= the active frequency
    // threshold) get travelling particles; the rest render static.
    if (frequency < minFrequency) return;
    const recency = recencyFactor(feature.properties?.last_seen);
    const numParticles = Math.min(Math.ceil(frequency / 3), 5);
    for (let p = 0; p < numParticles; p++) {
      const t = (offset / 100 + p / numParticles) % 1;
      if (coords.length >= 2) {
        const segmentCount = coords.length - 1;
        const segmentIndex = Math.floor(t * segmentCount);
        const segmentT = t * segmentCount - segmentIndex;
        const start = coords[Math.min(segmentIndex, coords.length - 2)];
        const end = coords[Math.min(segmentIndex + 1, coords.length - 1)];
        particles.push({
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [
              start[0] + (end[0] - start[0]) * segmentT,
              start[1] + (end[1] - start[1]) * segmentT,
            ],
          },
          properties: { frequency, particleIndex: p, recency },
        });
      }
    }
  });
  return { type: "FeatureCollection" as const, features: particles };
};

interface Params {
  mapRef: MutableRefObject<any>;
  mapLoaded: boolean;
  showMovementPaths: boolean;
  pathData: { geojson: any; stats: { total_paths: number } } | null | undefined;
  flowAnimationRef: MutableRefObject<number | null>;
  platformSettingsRef: MutableRefObject<PlatformSettings>;
  /** mapbox-gl module ref, used to construct the hover Popup. */
  mapboxglRef?: MutableRefObject<any>;
  /**
   * Current min-frequency selection. Routes at/above it are the "active"
   * (selected) routes and animate; routes below render static and dimmed.
   */
  minFrequency?: number;
}

/**
 * Builds / animates / tears down the movement-paths layer stack
 * (glow + line + arrows + particles) and its rAF flow animation.
 */
export const useMovementPathsLayer = ({
  mapRef,
  mapLoaded,
  showMovementPaths,
  pathData,
  flowAnimationRef,
  platformSettingsRef,
  mapboxglRef,
  minFrequency = 0,
}: Params) => {
  // Debounce incoming path data: realtime refreshes can land in bursts, and
  // each one triggers a GeoJSON re-parse + tile re-render. Coalescing them
  // keeps the map at a steady framerate while data settles.
  const [debouncedPathData, setDebouncedPathData] = useState(pathData);
  const isFirstPathData = useRef(true);

  // Latest selection threshold, readable from effects/animation without
  // forcing a full layer rebuild when the slider moves.
  const minFrequencyRef = useRef(minFrequency);
  useEffect(() => {
    minFrequencyRef.current = minFrequency;
  }, [minFrequency]);

  // Live re-selection: moving the slider re-filters which routes are active
  // (animated) vs static, immediately, without rebuilding the layer stack.
  useEffect(() => {
    if (!mapLoaded || !showMovementPaths) return;
    const map = mapRef.current;
    if (!map) return;
    try {
      [
        "movement-paths-glow",
        "movement-paths-line",
        "movement-paths-arrows",
      ].forEach((id) => {
        if (map.getLayer(id)) map.setFilter(id, activeFilter(minFrequency));
      });
      if (map.getLayer("movement-paths-line-static")) {
        map.setFilter(
          "movement-paths-line-static",
          inactiveFilter(minFrequency),
        );
      }
    } catch {
      /* layers may be mid-rebuild */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minFrequency, mapLoaded, showMovementPaths, debouncedPathData]);

  useEffect(() => {
    // First payload paints immediately so the layer isn't visibly delayed.
    if (isFirstPathData.current) {
      isFirstPathData.current = false;
      setDebouncedPathData(pathData);
      return;
    }
    const t = window.setTimeout(
      () => setDebouncedPathData(pathData),
      PATH_UPDATE_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(t);
  }, [pathData]);

  useEffect(() => {
    const pathData = debouncedPathData;
    if (flowAnimationRef.current) {
      cancelAnimationFrame(flowAnimationRef.current);
      flowAnimationRef.current = null;
    }

    if (!mapRef.current || !mapLoaded || !pathData) return;

    const sourceId = "movement-paths";
    const lineLayerId = "movement-paths-line";
    const staticLineLayerId = "movement-paths-line-static";
    const glowLayerId = "movement-paths-glow";
    const casingLayerId = "movement-paths-casing";
    const arrowLayerId = "movement-paths-arrows";
    const particleLayerId = "movement-paths-particles";

    // Toggle-off: tear everything down.
    if (!showMovementPaths) {
      [
        particleLayerId,
        arrowLayerId,
        lineLayerId,
        staticLineLayerId,
        casingLayerId,
        glowLayerId,
      ].forEach((id) => {
        try {
          if (mapRef.current?.getLayer(id)) mapRef.current.removeLayer(id);
        } catch {
          /* no-op */
        }
      });
      try {
        if (mapRef.current?.getSource(sourceId))
          mapRef.current.removeSource(sourceId);
      } catch {
        /* no-op */
      }
      try {
        if (mapRef.current?.getSource(`${sourceId}-particles`))
          mapRef.current.removeSource(`${sourceId}-particles`);
      } catch {
        /* no-op */
      }
      return;
    }

    // Fast path: source already exists — just push new GeoJSON so Mapbox
    // smoothly transitions line-width/color instead of flashing on rebuild.
    const existing = mapRef.current.getSource(sourceId) as any;
    if (existing) {
      try {
        existing.setData(withDecay(pathData.geojson));
        // Keep particle animation running against the new path set; no rebuild.
        return;
      } catch (err) {
        console.warn("paths setData failed, rebuilding:", err);
        [
          particleLayerId,
          arrowLayerId,
          lineLayerId,
          staticLineLayerId,
          casingLayerId,
          glowLayerId,
        ].forEach((id) => {
          try {
            if (mapRef.current?.getLayer(id)) mapRef.current.removeLayer(id);
          } catch {
            /* no-op */
          }
        });
        try {
          if (mapRef.current?.getSource(sourceId))
            mapRef.current.removeSource(sourceId);
        } catch {
          /* no-op */
        }
        try {
          if (mapRef.current?.getSource(`${sourceId}-particles`))
            mapRef.current.removeSource(`${sourceId}-particles`);
        } catch {
          /* no-op */
        }
      }
    }

    mapRef.current.addSource(sourceId, {
      type: "geojson",
      data: withDecay(pathData.geojson),
      lineMetrics: true,
    });

    // Frequency-based base widths, reused across glow/static/active line
    // layers so we can scale them per-zoom without nesting `["zoom"]` inside
    // a non-top-level expression (Mapbox v3 forbids that).
    const glowFreqWidth = [
      "interpolate",
      ["exponential", 1.5],
      ["get", "frequency"],
      1,
      12,
      5,
      18,
      10,
      26,
      20,
      34,
    ] as any;
    const lineFreqWidth = [
      "interpolate",
      ["exponential", 1.5],
      ["get", "frequency"],
      1,
      5,
      5,
      8,
      10,
      12,
      20,
      16,
    ] as any;

    // Flow palette (lavender → violet → magenta → gold) lives inline in the
    // paint expressions below. It stays deliberately off the heatmap's
    // blue→red ramp so both layers remain readable at the same time.

    mapRef.current.addLayer({
      id: glowLayerId,
      type: "line",
      source: sourceId,
      filter: activeFilter(minFrequencyRef.current),
      layout: {
        "line-join": "round",
        "line-cap": "round",
        ...FLOW_LINE_ELEVATION_LAYOUT,
      } as any,
      paint: {
        // Zoom must be the top-level interpolate input (Mapbox v3 rule);
        // each zoom stop multiplies the frequency-based width by a scale.
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          9,
          ["*", glowFreqWidth, 2],
          12,
          ["*", glowFreqWidth, 1.5],
          15,
          ["*", glowFreqWidth, 1.1],
          17,
          ["*", glowFreqWidth, 1],
        ],
        "line-color": [
          "interpolate",
          ["linear"],
          ["get", "frequency"],
          1,
          "rgba(150, 170, 255, 0.75)",
          5,
          "rgba(140, 120, 255, 0.85)",
          10,
          "rgba(186, 96, 255, 0.9)",
          15,
          "rgba(255, 92, 168, 0.95)",
          20,
          "rgba(255, 168, 56, 1)",
        ],
        // Glow softness + strength both scale with frequency so busier routes
        // read as visibly brighter, not just wider.
        "line-blur": [
          "interpolate",
          ["linear"],
          ["get", "frequency"],
          1,
          3,
          10,
          7,
          20,
          10,
        ],
        // Frequency drives strength; recency decays it as movement slows.
        "line-opacity": [
          "*",
          [
            "interpolate",
            ["linear"],
            ["get", "frequency"],
            1,
            0.7,
            5,
            0.85,
            10,
            0.95,
            20,
            1,
          ],
          ["coalesce", ["get", "recency"], 1],
        ],
        "line-width-transition": { duration: 800, delay: 0 },
        "line-color-transition": { duration: 800, delay: 0 },
        "line-opacity-transition": { duration: 600, delay: 0 },
      } as any,
    });

    // Static (unselected) routes: below the current frequency selection.
    // Rendered thin + dimmed with no dash animation and no particles.
    mapRef.current.addLayer({
      id: staticLineLayerId,
      type: "line",
      source: sourceId,
      filter: inactiveFilter(minFrequencyRef.current),
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          9,
          ["*", 3, 1.8],
          12,
          ["*", 3, 1.4],
          15,
          ["*", 3, 1.1],
          17,
          ["*", 3, 1],
        ],
        "line-color": "rgba(196, 205, 255, 0.9)",
        "line-opacity": ["*", 0.55, ["coalesce", ["get", "recency"], 1]],
        "line-opacity-transition": { duration: 600, delay: 0 },
      } as any,
    });

    // Dark casing under the active flow lines: keeps the bright ramp legible
    // over pale roads/water on the light (dawn) basemap without changing the
    // hue, and adds separation from the heatmap underneath on dark.
    mapRef.current.addLayer({
      id: casingLayerId,
      type: "line",
      source: sourceId,
      filter: activeFilter(minFrequencyRef.current),
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          9,
          ["*", lineFreqWidth, 2.4],
          12,
          ["*", lineFreqWidth, 1.9],
          15,
          ["*", lineFreqWidth, 1.5],
          17,
          ["*", lineFreqWidth, 1.35],
        ],
        "line-color": "rgba(8, 10, 24, 0.55)",
        "line-blur": 0.5,
        "line-opacity": ["*", 0.8, ["coalesce", ["get", "recency"], 1]],
        "line-opacity-transition": { duration: 600, delay: 0 },
      } as any,
    });

    mapRef.current.addLayer({
      id: lineLayerId,
      type: "line",
      source: sourceId,
      filter: activeFilter(minFrequencyRef.current),
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          9,
          ["*", lineFreqWidth, 1.8],
          12,
          ["*", lineFreqWidth, 1.4],
          15,
          ["*", lineFreqWidth, 1.1],
          17,
          ["*", lineFreqWidth, 1],
        ],
        "line-color": [
          "interpolate",
          ["linear"],
          ["get", "frequency"],
          1,
          "rgb(178, 196, 255)",
          5,
          "rgb(150, 138, 255)",
          10,
          "rgb(196, 112, 255)",
          15,
          "rgb(255, 106, 178)",
          20,
          "rgb(255, 178, 74)",
        ],
        "line-opacity": [
          "*",
          [
            "interpolate",
            ["linear"],
            ["get", "frequency"],
            1,
            0.95,
            5,
            1,
            10,
            1,
            20,
            1,
          ],
          ["coalesce", ["get", "recency"], 1],
        ],
        "line-opacity-transition": { duration: 900, delay: 0 },
        // Shorter gaps so the flow still reads as a continuous route when
        // zoomed out; the dash offset animation still conveys direction.
        "line-dasharray": [0, 2, 2],
        "line-width-transition": { duration: 800, delay: 0 },
        "line-color-transition": { duration: 800, delay: 0 },
        "line-occlusion-opacity": OCCLUSION_OPACITY * 0.6,
      } as any,
    });

    if (!mapRef.current.hasImage("flow-arrow")) {
      const size = 48;
      const arrowCanvas = document.createElement("canvas");
      arrowCanvas.width = size;
      arrowCanvas.height = size;
      const ctx = arrowCanvas.getContext("2d")!;
      const gradient = ctx.createLinearGradient(0, 0, size, 0);
      gradient.addColorStop(0, "rgba(255, 255, 255, 0.4)");
      gradient.addColorStop(0.5, "rgba(255, 255, 255, 1)");
      gradient.addColorStop(1, "rgba(255, 255, 255, 0.4)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(size * 0.2, size * 0.3);
      ctx.lineTo(size * 0.6, size * 0.5);
      ctx.lineTo(size * 0.2, size * 0.7);
      ctx.lineTo(size * 0.35, size * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.shadowColor = "rgba(255, 255, 255, 0.8)";
      ctx.shadowBlur = 8;
      ctx.fill();
      mapRef.current.addImage("flow-arrow", {
        width: size,
        height: size,
        data: ctx.getImageData(0, 0, size, size).data as any,
      });
    }

    mapRef.current.addLayer({
      id: arrowLayerId,
      type: "symbol",
      source: sourceId,
      filter: activeFilter(minFrequencyRef.current),
      layout: {
        "symbol-placement": "line",
        "symbol-spacing": 40,
        "icon-image": "flow-arrow",
        "icon-size": [
          "interpolate",
          ["linear"],
          ["get", "frequency"],
          1,
          0.6,
          10,
          0.9,
          20,
          1.2,
        ],
        "icon-rotate": 90,
        "icon-rotation-alignment": "map",
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      } as any,
      paint: {
        "icon-opacity": ["*", 0.85, ["coalesce", ["get", "recency"], 1]],
      } as any,
    });

    mapRef.current.addSource(`${sourceId}-particles`, {
      type: "geojson",
      data: buildParticleData(pathData.geojson, 0, minFrequencyRef.current),
    });

    mapRef.current.addLayer({
      id: particleLayerId,
      type: "circle",
      source: `${sourceId}-particles`,
      paint: {
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["get", "frequency"],
          1,
          4,
          10,
          7,
          20,
          10,
        ],
        "circle-color": [
          "interpolate",
          ["linear"],
          ["get", "frequency"],
          1,
          "rgb(222, 232, 255)",
          5,
          "rgb(198, 178, 255)",
          10,
          "rgb(236, 168, 255)",
          15,
          "rgb(255, 176, 214)",
          20,
          "rgb(255, 226, 170)",
        ],
        "circle-opacity": ["*", 0.9, ["coalesce", ["get", "recency"], 1]],
        "circle-blur": 0.3,
        "circle-stroke-width": 2,
        "circle-stroke-color": "rgba(255, 255, 255, 0.8)",
      } as any,
    });

    devLog(
      "Movement paths layer added with",
      pathData.stats.total_paths,
      "paths and animated particles",
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapLoaded, debouncedPathData, showMovementPaths]);

  /**
   * Flow animation lives in its own effect keyed only on the toggle, so it
   * starts the moment Flow Paths is selected and keeps running across data
   * refreshes (which previously took the early-return `setData` fast path and
   * silently killed the rAF loop).
   */
  const latestPathData = useRef(pathData);
  useEffect(() => {
    latestPathData.current = pathData;
  }, [pathData]);

  useEffect(() => {
    if (flowAnimationRef.current) {
      cancelAnimationFrame(flowAnimationRef.current);
      flowAnimationRef.current = null;
    }
    if (!mapLoaded || !showMovementPaths) return;

    const lineLayerId = "movement-paths-line";
    const particleSourceId = "movement-paths-particles";

    let step = 0;
    let particleOffset = 0;
    let lastTime = performance.now();

    const animateFlow = (currentTime: number) => {
      const settings = platformSettingsRef.current;
      if (
        !mapRef.current ||
        document.hidden ||
        settings.hasReducedMotion ||
        settings.isLowPowerMode
      ) {
        // Stay scheduled (cheaply) so motion resumes when the tab returns.
        flowAnimationRef.current = requestAnimationFrame(animateFlow);
        return;
      }
      if (currentTime - lastTime > 80) {
        step = (step + 1) % DASH_SEQUENCE.length;
        try {
          if (mapRef.current.getLayer(lineLayerId)) {
            mapRef.current.setPaintProperty(
              lineLayerId,
              "line-dasharray",
              DASH_SEQUENCE[step],
            );
          }
          particleOffset = (particleOffset + 2) % 100;
          const particleSource = mapRef.current.getSource(particleSourceId);
          const geojson = latestPathData.current?.geojson;
          if (particleSource && geojson) {
            particleSource.setData(
              buildParticleData(
                geojson,
                particleOffset,
                minFrequencyRef.current,
              ),
            );
          }
        } catch {
          /* layers may be mid-rebuild */
        }
        lastTime = currentTime;
      }
      flowAnimationRef.current = requestAnimationFrame(animateFlow);
    };

    flowAnimationRef.current = requestAnimationFrame(animateFlow);

    return () => {
      if (flowAnimationRef.current) {
        cancelAnimationFrame(flowAnimationRef.current);
        flowAnimationRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapLoaded, showMovementPaths]);

  /**
   * Decay ticker: re-stamps `recency` on the live source against the wall
   * clock so routes visibly fade as movement slows, even when no new data
   * arrives. Paused while the tab is hidden.
   */
  useEffect(() => {
    if (!mapLoaded || !showMovementPaths || !debouncedPathData?.geojson) return;
    const id = window.setInterval(() => {
      if (document.hidden) return;
      const src = mapRef.current?.getSource("movement-paths") as any;
      if (!src?.setData) return;
      try {
        src.setData(withDecay(debouncedPathData.geojson));
      } catch {
        /* no-op */
      }
    }, DECAY_TICK_MS);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapLoaded, showMovementPaths, debouncedPathData]);

  /**
   * Hover / tap tooltip on flow paths: real user movement counts, route
   * frequency, and the last time the route was observed. Registered in its
   * own effect so the fast-path `setData` update above never drops it.
   */
  useEffect(() => {
    const map = mapRef.current;
    const mapboxgl = mapboxglRef?.current ?? (window as any).mapboxgl;
    if (!map || !mapLoaded || !showMovementPaths || !mapboxgl) return;

    const lineLayerId = "movement-paths-line";
    let popup: any = null;

    const relativeTime = (iso: string | null | undefined) => {
      if (!iso) return "unknown";
      const diffMin = Math.max(
        0,
        Math.round((Date.now() - new Date(iso).getTime()) / 60000),
      );
      if (diffMin < 1) return "just now";
      if (diffMin < 60) return `${diffMin}m ago`;
      const h = Math.round(diffMin / 60);
      if (h < 24) return `${h}h ago`;
      return `${Math.round(h / 24)}d ago`;
    };

    const showPopup = (e: any) => {
      const feature = e.features?.[0];
      if (!feature) return;
      const p = feature.properties || {};
      const freq = Number(p.frequency) || 0;
      const users = Number(p.unique_users) || 0;
      const html = `
        <div style="font-size:11px;line-height:1.45;min-width:150px">
          <div style="font-weight:600;margin-bottom:3px">Movement route</div>
          <div>${freq} movement${freq === 1 ? "" : "s"} by ${users} user${users === 1 ? "" : "s"}</div>
          <div style="opacity:.75">Route frequency: ${freq}x</div>
          <div style="opacity:.75">Last seen: ${relativeTime(p.last_seen)}</div>
        </div>`;
      if (!popup) {
        popup = new mapboxgl.Popup({
          closeButton: false,
          closeOnClick: false,
          offset: 12,
          className: "flow-path-popup",
        });
      }
      popup.setLngLat(e.lngLat).setHTML(html).addTo(map);
      map.getCanvas().style.cursor = "pointer";
    };

    const hidePopup = () => {
      if (popup) {
        popup.remove();
        popup = null;
      }
      try {
        map.getCanvas().style.cursor = "";
      } catch {
        /* no-op */
      }
    };

    // Throttle hover updates to one per animation frame — mousemove fires far
    // faster than the map can usefully repaint the popup.
    let hoverFrame: number | null = null;
    const onHover = (e: any) => {
      if (hoverFrame !== null) return;
      hoverFrame = requestAnimationFrame(() => {
        hoverFrame = null;
        showPopup(e);
      });
    };

    map.on("mousemove", lineLayerId, onHover);
    map.on("mouseleave", lineLayerId, hidePopup);
    map.on("click", lineLayerId, showPopup);

    return () => {
      if (hoverFrame !== null) cancelAnimationFrame(hoverFrame);
      try {
        map.off("mousemove", lineLayerId, onHover);
        map.off("mouseleave", lineLayerId, hidePopup);
        map.off("click", lineLayerId, showPopup);
      } catch {
        /* no-op */
      }
      hidePopup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapLoaded, showMovementPaths]);
};
