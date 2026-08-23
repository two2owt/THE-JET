/**
 * Narrow, defensive readers for the GeoJSON payloads the density / movement
 * edge functions return.
 *
 * The wire format is untrusted JSON, so instead of casting features to `any`
 * we parse them into small explicit shapes and drop anything malformed.
 */

export type Position = [number, number];

export type MapFeature = {
  geometry?: { type?: string; coordinates?: unknown } | null;
  properties?: Record<string, unknown> | null;
};

export type FeatureCollectionLike = {
  features?: unknown;
} | null | undefined;

/** Returns the feature array of a collection, or [] when absent/malformed. */
export const featuresOf = (collection: FeatureCollectionLike): MapFeature[] => {
  const feats = collection?.features;
  return Array.isArray(feats) ? (feats as MapFeature[]) : [];
};

/** Reads a numeric feature property, falling back when missing or NaN. */
export const numProp = (
  feature: MapFeature | null | undefined,
  key: string,
  fallback = 0,
): number => {
  const raw = feature?.properties?.[key];
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
};

/** Reads a `[lng, lat]` pair from a Point feature, or null. */
export const pointCoords = (
  feature: MapFeature | null | undefined,
): Position | null => {
  const coords = feature?.geometry?.coordinates;
  if (!Array.isArray(coords)) return null;
  const [lng, lat] = coords as unknown[];
  return typeof lng === "number" && typeof lat === "number" ? [lng, lat] : null;
};

/** Reads a LineString's positions, dropping any non-numeric pairs. */
export const lineCoords = (
  feature: MapFeature | null | undefined,
): Position[] => {
  const coords = feature?.geometry?.coordinates;
  if (!Array.isArray(coords)) return [];
  return (coords as unknown[]).flatMap((pair) => {
    if (!Array.isArray(pair)) return [];
    const [lng, lat] = pair as unknown[];
    return typeof lng === "number" && typeof lat === "number"
      ? [[lng, lat] as Position]
      : [];
  });
};
