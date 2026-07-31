/**
 * GPS noise reduction for the location tracker.
 *
 * Raw `watchPosition` fixes jitter by tens of metres even when the device is
 * stationary, which produces dense clusters of near-identical points in the
 * heatmap. Every fix runs through this filter before it can become a write:
 *
 * 1. Accuracy gate    — drop fixes worse than `maxAccuracyMeters`.
 * 2. Speed gate       — drop physically implausible jumps (GPS teleports).
 * 3. Stationary gate  — treat movement inside the accuracy radius as noise.
 * 4. EMA smoothing    — blend into the running estimate, weighting accurate
 *                       fixes more than fuzzy ones.
 * 5. Grid snapping    — quantise output so residual jitter collapses onto the
 *                       same coordinate instead of smearing the heatmap.
 */

export interface GeoSample {
  lat: number;
  lng: number;
  accuracy: number | null;
  timestamp?: number;
}

export interface SmoothedFix {
  lat: number;
  lng: number;
  accuracy: number | null;
  /** Metres between this fix and the previous emitted one. */
  movedMeters: number;
}

export interface SmootherOptions {
  /** Reject fixes with accuracy worse than this (metres). */
  maxAccuracyMeters?: number;
  /** Reject jumps implying a speed above this (metres/second, ~150 km/h). */
  maxSpeedMps?: number;
  /** Treat movement below this as sensor noise (metres). */
  stationaryMeters?: number;
  /** Grid size for output quantisation (degrees, ~1.1m at 5 decimals). */
  gridDegrees?: number;
}

const DEFAULTS: Required<SmootherOptions> = {
  maxAccuracyMeters: 100,
  maxSpeedMps: 42,
  stationaryMeters: 8,
  gridDegrees: 0.00005,
};

export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) {
  const toRad = (n: number) => (n * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

const snap = (value: number, grid: number) => Math.round(value / grid) * grid;

export function createLocationSmoother(options: SmootherOptions = {}) {
  const opts = { ...DEFAULTS, ...options };

  let estimate: { lat: number; lng: number; accuracy: number; at: number } | null = null;
  let lastEmitted: { lat: number; lng: number } | null = null;

  return {
    /**
     * Feed a raw fix. Returns the smoothed coordinate to persist, or `null`
     * when the fix was rejected as noise.
     */
    push(sample: GeoSample): SmoothedFix | null {
      const now = sample.timestamp ?? Date.now();
      const accuracy =
        typeof sample.accuracy === "number" && Number.isFinite(sample.accuracy)
          ? Math.max(sample.accuracy, 1)
          : opts.maxAccuracyMeters;

      if (!Number.isFinite(sample.lat) || !Number.isFinite(sample.lng)) return null;
      if (accuracy > opts.maxAccuracyMeters) return null;

      if (!estimate) {
        estimate = { lat: sample.lat, lng: sample.lng, accuracy, at: now };
      } else {
        const distance = haversineMeters(estimate, sample);
        const elapsed = Math.max((now - estimate.at) / 1000, 1);

        // Implausible teleport → discard outright.
        if (distance / elapsed > opts.maxSpeedMps) return null;

        const noiseFloor = Math.max(opts.stationaryMeters, accuracy * 0.5);
        if (distance < noiseFloor) {
          // Inside the noise floor: keep the estimate anchored (a tighter fix
          // may nudge it) but emit nothing new.
          const tighten = accuracy < estimate.accuracy ? 0.2 : 0.05;
          estimate = {
            lat: estimate.lat + (sample.lat - estimate.lat) * tighten,
            lng: estimate.lng + (sample.lng - estimate.lng) * tighten,
            accuracy: Math.min(estimate.accuracy, accuracy),
            at: now,
          };
          if (lastEmitted) return null;
          lastEmitted = { lat: snap(estimate.lat, opts.gridDegrees), lng: snap(estimate.lng, opts.gridDegrees) };
          return { ...lastEmitted, accuracy: Math.round(estimate.accuracy), movedMeters: 0 };
        }

        // Accuracy-weighted exponential moving average: a tight fix pulls the
        // estimate most of the way, a fuzzy one barely moves it.
        const weight = Math.min(
          0.9,
          Math.max(0.2, estimate.accuracy / (estimate.accuracy + accuracy)),
        );
        estimate = {
          lat: estimate.lat + (sample.lat - estimate.lat) * weight,
          lng: estimate.lng + (sample.lng - estimate.lng) * weight,
          accuracy: (estimate.accuracy + accuracy) / 2,
          at: now,
        };
      }

      const out = {
        lat: snap(estimate.lat, opts.gridDegrees),
        lng: snap(estimate.lng, opts.gridDegrees),
      };
      const movedMeters = lastEmitted ? haversineMeters(lastEmitted, out) : Infinity;
      lastEmitted = out;

      return { ...out, accuracy: Math.round(estimate.accuracy), movedMeters };
    },

    reset() {
      estimate = null;
      lastEmitted = null;
    },
  };
}

export type LocationSmoother = ReturnType<typeof createLocationSmoother>;