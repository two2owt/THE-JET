/**
 * Tiny pub/sub for "the map has actually painted".
 *
 * Used to keep non-critical work (permission prompts, background prefetch)
 * strictly after the largest above-the-fold element has rendered, so nothing
 * competes with LCP or covers the map before the user has seen it.
 */

const FLAG = "__jetMapPainted";
const EVENT = "jet:map-painted";

type W = Window & { [FLAG]?: boolean };

export const isMapPainted = (): boolean =>
  typeof window !== "undefined" && (window as W)[FLAG] === true;

/** Called by the map component once Mapbox reports its first render. */
export const markMapPainted = () => {
  if (typeof window === "undefined") return;
  const w = window as W;
  if (w[FLAG]) return;
  w[FLAG] = true;
  window.dispatchEvent(new Event(EVENT));
};

/**
 * Runs `cb` once the map has painted. Returns an unsubscribe function.
 * Fires immediately when the map has already painted.
 */
export const onMapPainted = (cb: () => void): (() => void) => {
  if (typeof window === "undefined") return () => {};
  if (isMapPainted()) {
    cb();
    return () => {};
  }
  const handler = () => cb();
  window.addEventListener(EVENT, handler, { once: true });
  return () => window.removeEventListener(EVENT, handler);
};

/** True when this document actually hosts a map surface. */
export const documentHasMapSurface = (): boolean =>
  typeof document !== "undefined" &&
  document.querySelector("[data-map-container]") !== null;
