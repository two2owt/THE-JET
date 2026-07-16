/**
 * Pure persistence contract for map layer toggles.
 *
 * Extracted from `MapboxHeatmap` so the read side (URL param → localStorage
 * → fallback) is testable in isolation. Any change to key names or priority
 * order will break the persistence tests, which is the point — those rules
 * are user-visible (survive refresh, respect deep links, cleared by Reset).
 */
export const LAYER_KEYS = {
  density: "jet-map-layer-density",
  paths: "jet-map-layer-paths",
  parking: "jet-map-layer-parking",
  stats: "jet-map-layer-stats",
} as const;

export type LayerName = keyof typeof LAYER_KEYS;

export const KNOWN_LAYERS = new Set<LayerName>(
  Object.keys(LAYER_KEYS) as LayerName[],
);

/**
 * Resolve whether a given layer should be initially active.
 *
 * Priority:
 *   1. `?layers=` URL param — only enables layers it explicitly names; layers
 *      it omits fall through so a deep link like `?layers=density` doesn't
 *      silently disable paths that the user had persisted.
 *   2. `localStorage[LAYER_KEYS[layer]]` — persisted user choice.
 *   3. `fallback` — component default.
 */
export function readLayerState(
  layer: LayerName,
  urlSearch: string,
  fallback: boolean,
): boolean {
  try {
    const params = new URLSearchParams(urlSearch);
    const layers = params.get("layers");
    if (layers !== null) {
      const tokens = layers
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter((s) => KNOWN_LAYERS.has(s as LayerName)) as LayerName[];
      if (tokens.includes(layer)) return true;
    }
  } catch {
    // ignore malformed URL params
  }
  try {
    const raw = localStorage.getItem(LAYER_KEYS[layer]);
    return raw !== null ? raw === "true" : fallback;
  } catch {
    return fallback;
  }
}

/** Clear every persisted layer toggle. Used by "Reset to defaults". */
export function clearPersistedLayerState(): void {
  Object.values(LAYER_KEYS).forEach((key) => {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  });
}

/**
 * URL query params that seed layer/filter state on load. Reset must strip
 * every one of them, otherwise a refresh restores the toggles the user
 * just cleared.
 */
export const LAYER_URL_PARAMS = [
  "layers",
  "time",
  "day",
  "pathTime",
] as const;

/**
 * Strip every persisted layer/filter query param from the current URL via
 * `history.replaceState` (no navigation). Returns `true` on success so the
 * caller can verify the URL is clean before touching component state.
 */
export function clearPersistedLayerUrl(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    let mutated = false;
    LAYER_URL_PARAMS.forEach((key) => {
      if (params.has(key)) {
        params.delete(key);
        mutated = true;
      }
    });
    // Always replaceState — even when nothing was removed — so callers get
    // a consistent "URL is now canonical" postcondition.
    const search = params.toString();
    const newUrl = search
      ? `${window.location.pathname}?${search}`
      : window.location.pathname;
    window.history.replaceState(null, "", newUrl);
    return mutated || true;
  } catch {
    return false;
  }
}