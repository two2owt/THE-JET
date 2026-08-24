/**
 * Two-way "which venue is currently under the user's attention" bus.
 *
 * The search results list publishes the row nearest the top of its viewport as
 * it scrolls; the map publishes the marker under the pointer / just selected.
 * Both sides subscribe, so highlighting stays in sync without either owning the
 * other's state — and without any camera movement (that stays in mapFocusBus).
 */

export type HighlightSource = "list" | "map";

export interface MapHighlight {
  venueId: string | null;
  source: HighlightSource;
}

const EVENT = "jet:map-highlight";

let current: MapHighlight = { venueId: null, source: "list" };

export function getMapHighlight(): MapHighlight {
  return current;
}

/** Toggle the `data-highlight` flag on the live marker DOM (cheap, no re-render). */
export function applyMapHighlightToDom() {
  if (typeof document === "undefined") return;
  const id = current.venueId;
  document
    .querySelectorAll<HTMLElement>(".venue-marker[data-highlight='true']")
    .forEach((el) => {
      if (!id || el.dataset.venueId !== id) delete el.dataset.highlight;
    });
  if (!id) return;
  document
    .querySelectorAll<HTMLElement>(
      `.venue-marker[data-venue-id="${CSS.escape(id)}"]`,
    )
    .forEach((el) => {
      el.dataset.highlight = "true";
    });
}

export function setMapHighlight(
  venueId: string | null,
  source: HighlightSource,
) {
  if (current.venueId === venueId && current.source === source) return;
  current = { venueId, source };
  applyMapHighlightToDom();
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<MapHighlight>(EVENT, { detail: current }));
}

export function subscribeMapHighlight(
  handler: (highlight: MapHighlight) => void,
) {
  if (typeof window === "undefined") return () => {};
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<MapHighlight>).detail;
    if (detail) handler(detail);
  };
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
