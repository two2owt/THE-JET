import { devLog } from "@/lib/log";

/**
 * The Mapbox GL JS version this app is pinned to. This must stay in sync with
 * three places:
 *   - the `mapbox-gl` dependency pin in package.json
 *   - the CDN <script> in src/routes/__root.tsx
 *   - the CDN stylesheet <link> in src/routes/__root.tsx
 */
export const EXPECTED_MAPBOX_VERSION = "3.28.1";

export type MapboxVersionCheck = {
  expected: string;
  actual: string | null;
  /** true when the loaded runtime reports exactly the expected version */
  matches: boolean;
  /** where the runtime came from, for diagnostics */
  source: "cdn" | "bundle" | "unknown";
};

let lastCheck: MapboxVersionCheck | null = null;
let warned = false;

/** The last version check performed in this session, if any. */
export const getMapboxVersionCheck = (): MapboxVersionCheck | null => lastCheck;

const readVersion = (mapboxgl: unknown): string | null => {
  const v = (mapboxgl as { version?: unknown } | null)?.version;
  return typeof v === "string" && v.length > 0 ? v : null;
};

/**
 * Verifies the loaded GL JS runtime matches the configured pin. Logs quietly on
 * a match and warns once per session on a mismatch (or when the version cannot
 * be read at all), so version drift between npm and the CDN is visible in the
 * console instead of surfacing later as odd style/layer behaviour.
 */
export const verifyMapboxVersion = (
  mapboxgl: unknown,
  source: MapboxVersionCheck["source"] = "unknown",
): MapboxVersionCheck => {
  const actual = readVersion(mapboxgl);
  const matches = actual === EXPECTED_MAPBOX_VERSION;
  const result: MapboxVersionCheck = {
    expected: EXPECTED_MAPBOX_VERSION,
    actual,
    matches,
    source,
  };
  lastCheck = result;

  if (matches) {
    devLog(`Mapbox GL JS ${actual} (${source}) matches pinned version`);
    return result;
  }

  if (!warned) {
    warned = true;
    if (actual) {
      console.warn(
        `[mapbox] Version mismatch: loaded ${actual} from ${source}, expected ${EXPECTED_MAPBOX_VERSION}. ` +
          "Align the npm pin and the CDN script/stylesheet in the root route.",
      );
    } else {
      console.warn(
        `[mapbox] Could not read the loaded GL JS version (source: ${source}); expected ${EXPECTED_MAPBOX_VERSION}.`,
      );
    }
  }

  if (typeof window !== "undefined") {
    (window as unknown as Record<string, unknown>).__mapboxVersionCheck =
      result;
  }

  return result;
};
