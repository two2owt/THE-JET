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
 * Canonical order for serializing `?layers=`. Fixed so that toggling the
 * same set on/off in any sequence always produces the same URL string —
 * the writer's "did URL change?" check relies on this to avoid ping-ponging
 * `replaceState` calls and to keep browser history stable.
 */
export const LAYER_SERIALIZE_ORDER: readonly LayerName[] = [
  "density",
  "paths",
  "parking",
  "stats",
];

/**
 * Parse `?layers=` into a normalized set of known layers.
 *
 * Hardened against every real-world way this param can arrive malformed:
 *   - Missing / empty param → empty set (caller falls back to storage).
 *   - Repeated occurrences (`?layers=density&layers=paths`) → merged.
 *   - Case variance (`DENSITY`, `Paths`) → lowercased.
 *   - Whitespace & empty tokens (`,density, ,paths,`) → trimmed / dropped.
 *   - Unknown tokens (`foo`, `heat`) → ignored, never surfaced to the UI.
 *   - Duplicate tokens → deduped by Set membership.
 *   - Malformed query strings → caught, empty set returned.
 *
 * Returns `null` when the `layers` param is absent entirely, which the
 * reader uses to distinguish "URL says nothing, defer to storage" from
 * "URL explicitly says no layers".
 */
export function parseLayersParam(
  urlSearch: string,
): Set<LayerName> | null {
  try {
    const params = new URLSearchParams(urlSearch);
    if (!params.has("layers")) return null;
    const raw = params.getAll("layers").join(",");
    const active = new Set<LayerName>();
    for (const token of raw.split(",")) {
      const t = token.trim().toLowerCase();
      if (t && KNOWN_LAYERS.has(t as LayerName)) {
        active.add(t as LayerName);
      }
    }
    return active;
  } catch {
    return new Set<LayerName>();
  }
}

/**
 * Serialize an active-layer set into the canonical `?layers=` value, or
 * `null` if nothing is active (caller should `delete("layers")`).
 *
 * Order is fixed (`LAYER_SERIALIZE_ORDER`) and duplicates are dropped, so
 * writing then re-parsing is idempotent — no infinite `replaceState` loops.
 */
export function serializeLayersParam(
  active: Iterable<LayerName>,
): string | null {
  const set = new Set<LayerName>();
  for (const layer of active) {
    if (KNOWN_LAYERS.has(layer)) set.add(layer);
  }
  if (set.size === 0) return null;
  return LAYER_SERIALIZE_ORDER.filter((l) => set.has(l)).join(",");
}

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
  const parsed = parseLayersParam(urlSearch);
  if (parsed && parsed.has(layer)) return true;
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