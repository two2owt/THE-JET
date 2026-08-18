import { useEffect, MutableRefObject } from "react";

/**
 * Pitch/distance marker thinning.
 *
 * Mirrors Mapbox GL JS v3's `["pitch"]` / `["distance-from-center"]` filter
 * expressions, which only apply to style layers. Venue pins are DOM
 * `mapboxgl.Marker`s, so the same expressions are evaluated here in JS against
 * the live camera and applied to each marker element.
 *
 * Distance is measured in viewport half-heights from the screen centre, the
 * same unit Mapbox uses for `distance-from-center`.
 *
 * Behaviour: a flat (low-pitch) camera shows the whole city at once and gets
 * cluttered fast, so the visible radius is tightest there and widens as the
 * camera tilts into a horizon view where distant pins compress toward the top
 * of the screen.
 */

/** Piecewise-linear interpolate, matching Mapbox `["interpolate", ["linear"], ...]`. */
const interpolate = (input: number, stops: Array<[number, number]>) => {
  if (input <= stops[0][0]) return stops[0][1];
  const last = stops[stops.length - 1];
  if (input >= last[0]) return last[1];
  for (let i = 0; i < stops.length - 1; i++) {
    const [x0, y0] = stops[i];
    const [x1, y1] = stops[i + 1];
    if (input >= x0 && input <= x1) {
      const t = x1 === x0 ? 0 : (input - x0) / (x1 - x0);
      return y0 + (y1 - y0) * t;
    }
  }
  return last[1];
};

/**
 * Visible radius (in viewport half-heights) as a function of camera pitch.
 * ["interpolate", ["linear"], ["pitch"], 0, 1.15, 25, 1.5, 45, 2.1, 60, 2.8]
 */
const radiusForPitch = (pitch: number) =>
  interpolate(pitch, [
    [0, 1.15],
    [25, 1.5],
    [45, 2.1],
    [60, 2.8],
  ]);

/** Zoomed-out views cover more ground, so allow a slightly wider ring. */
const radiusZoomScale = (zoom: number) =>
  interpolate(zoom, [
    [9, 1.35],
    [12, 1.15],
    [14, 1],
    [17, 1],
  ]);

/** Width of the soft fade band just inside the cull radius. */
const FADE_BAND = 0.45;
/** Below this many markers there is nothing to declutter. */
const MIN_MARKERS_TO_THIN = 12;

interface Params {
  mapRef: MutableRefObject<any>;
  mapLoaded: boolean;
  markersRef: MutableRefObject<Array<{ getElement: () => HTMLElement }>>;
  /** Marker count changes should re-run the pass immediately. */
  markerRevision?: unknown;
  enabled?: boolean;
}

export const useMarkerDeclutter = ({
  mapRef,
  mapLoaded,
  markersRef,
  markerRevision,
  enabled = true,
}: Params) => {
  useEffect(() => {
    const map = mapRef.current;
    if (!mapLoaded || !map) return;

    let frame: number | null = null;

    const reset = () => {
      markersRef.current.forEach((m) => {
        const el = m?.getElement?.();
        if (!el) return;
        el.style.removeProperty("--declutter-opacity");
        el.style.visibility = "";
        el.style.pointerEvents = "";
      });
    };

    const apply = () => {
      frame = null;
      const markers = markersRef.current;
      if (!markers?.length) return;
      if (!enabled || markers.length < MIN_MARKERS_TO_THIN) {
        reset();
        return;
      }

      let pitch = 0;
      let zoom = 14;
      let height = 0;
      try {
        pitch = map.getPitch();
        zoom = map.getZoom();
        height = map.getContainer()?.clientHeight ?? 0;
      } catch {
        return;
      }
      if (!height) return;

      const halfHeight = height / 2;
      const centerX = (map.getContainer()?.clientWidth ?? 0) / 2;
      const cull = radiusForPitch(pitch) * radiusZoomScale(zoom);
      const fadeStart = Math.max(0.2, cull - FADE_BAND);

      markers.forEach((marker) => {
        const el = marker?.getElement?.();
        if (!el) return;

        // The selected pin (and any pin the user is interacting with) is never
        // thinned out — it is the subject of the open JetCard.
        if (el.dataset.selected === "true") {
          el.style.setProperty("--declutter-opacity", "1");
          el.style.visibility = "";
          el.style.pointerEvents = "";
          return;
        }

        let point: { x: number; y: number };
        try {
          point = map.project((marker as any).getLngLat());
        } catch {
          return;
        }

        const dx = (point.x - centerX) / halfHeight;
        const dy = (point.y - halfHeight) / halfHeight;
        const distance = Math.hypot(dx, dy);

        if (distance >= cull) {
          el.style.setProperty("--declutter-opacity", "0");
          el.style.visibility = "hidden";
          el.style.pointerEvents = "none";
          return;
        }

        const fade =
          distance <= fadeStart
            ? 1
            : 1 - (distance - fadeStart) / (cull - fadeStart);
        el.style.setProperty(
          "--declutter-opacity",
          (Math.max(0.15, fade) as number).toFixed(2),
        );
        el.style.visibility = "";
        el.style.pointerEvents = "";
      });
    };

    const schedule = () => {
      if (frame != null) return;
      frame = requestAnimationFrame(apply);
    };

    schedule();
    map.on("move", schedule);
    map.on("pitch", schedule);
    map.on("zoom", schedule);
    map.on("resize", schedule);

    return () => {
      if (frame != null) cancelAnimationFrame(frame);
      try {
        map.off("move", schedule);
        map.off("pitch", schedule);
        map.off("zoom", schedule);
        map.off("resize", schedule);
      } catch {
        /* map torn down */
      }
      reset();
    };
  }, [mapRef, mapLoaded, markersRef, markerRevision, enabled]);
};
