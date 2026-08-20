export interface ClusterablePoint {
  lat: number;
  lng: number;
}

export interface VenueCluster<T extends ClusterablePoint> {
  lat: number;
  lng: number;
  items: T[];
}

/** Below this zoom, dense marker fields collapse into cluster bubbles. */
export const CLUSTER_MAX_ZOOM = 13;

/**
 * Cheap grid clustering (no supercluster dependency): buckets points into
 * degree cells whose size shrinks as zoom increases, then returns the
 * multi-point buckets as clusters and everything else as singles.
 */
export function clusterVenues<T extends ClusterablePoint>(
  points: T[],
  zoom: number,
): { clusters: VenueCluster<T>[]; singles: T[] } {
  if (zoom >= CLUSTER_MAX_ZOOM || points.length < 2) {
    return { clusters: [], singles: points };
  }

  // ~64px worth of degrees at the current zoom, clamped for sanity.
  const cell = Math.max(0.0015, 0.6 / Math.pow(2, Math.max(0, zoom - 4)));
  const buckets = new Map<string, T[]>();

  for (const p of points) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue;
    const key = `${Math.floor(p.lat / cell)}:${Math.floor(p.lng / cell)}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(p);
    else buckets.set(key, [p]);
  }

  const clusters: VenueCluster<T>[] = [];
  const singles: T[] = [];

  for (const items of buckets.values()) {
    if (items.length < 3) {
      singles.push(...items);
      continue;
    }
    const lat = items.reduce((s, p) => s + p.lat, 0) / items.length;
    const lng = items.reduce((s, p) => s + p.lng, 0) / items.length;
    clusters.push({ lat, lng, items });
  }

  return { clusters, singles };
}
