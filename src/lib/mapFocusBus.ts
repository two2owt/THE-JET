/**
 * Tiny event bus used to ask the map to focus (centre + highlight) a point or
 * an area after an explicit user action — today: picking a search result.
 *
 * Deliberately decoupled from React props: the search panel is rendered into a
 * portal far from <MapboxHeatmap />, and this keeps the request one-way and
 * side-effect free (no camera state stored anywhere).
 */

export type MapFocusRequest =
  | {
      kind: "point";
      lng: number;
      lat: number;
      /** Optional venue id so the map can pulse the matching marker. */
      id?: string;
      /** Minimum zoom to settle at; the camera never zooms *out* below this. */
      minZoom?: number;
    }
  | {
      kind: "bounds";
      /** [[west, south], [east, north]] */
      bounds: [[number, number], [number, number]];
      maxZoom?: number;
    };

const EVENT = "jet:map-focus";

export function requestMapFocus(request: MapFocusRequest) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<MapFocusRequest>(EVENT, { detail: request }));
}

export function subscribeMapFocus(handler: (request: MapFocusRequest) => void) {
  if (typeof window === "undefined") return () => {};
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<MapFocusRequest>).detail;
    if (detail) handler(detail);
  };
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
