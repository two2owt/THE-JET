/**
 * Automatic retry + exponential backoff for Mapbox tile/network failures.
 *
 * Mapbox GL does not retry a tile request that failed because of a transient
 * network blip (offline for a second, flaky mobile data, 5xx from the CDN).
 * The tile simply stays blank until something else forces the source to
 * refetch. This controller listens for those errors and re-requests the
 * failed sources on a backoff schedule, and immediately when the browser
 * reports it is back online.
 */

type AnyMap = any;

export interface TileRetryOptions {
  /** Max automatic attempts before giving up and surfacing an error. */
  maxAttempts?: number;
  /** First delay in ms; doubles each attempt. */
  baseDelayMs?: number;
  /** Upper bound for a single delay. */
  maxDelayMs?: number;
  /** Called when tiles come back after a retry. */
  onRecovered?: () => void;
  /** Called when every attempt failed. */
  onExhausted?: () => void;
  /** Called before each retry (1-based attempt number). */
  onRetry?: (attempt: number, delayMs: number) => void;
}

export interface TileRetryController {
  /**
   * Feed a map `error` event payload. Returns true when the error was a
   * transient tile/network failure that is now being retried automatically.
   */
  handleError: (err: any) => boolean;
  /** Reset the backoff after a successful load. */
  notifySuccess: () => void;
  dispose: () => void;
}

const TRANSIENT_STATUSES = new Set([0, 408, 425, 429, 500, 502, 503, 504]);

const isTransient = (err: any): boolean => {
  const status = err?.status ?? err?.statusCode;
  const message = String(err?.message ?? "");
  if (typeof status === "number") return TRANSIENT_STATUSES.has(status);
  return /network|failed to fetch|load failed|timeout|aborted|tile/i.test(
    message,
  );
};

const urlOf = (err: any): string | undefined =>
  err?.url ?? err?.resource?.url ?? err?.request?.url;

/** Force every tiled source to re-request its tiles. */
const refreshTiledSources = (map: AnyMap) => {
  if (!map || typeof map.getStyle !== "function") return;
  let style: any;
  try {
    style = map.getStyle();
  } catch {
    return;
  }
  const sources = style?.sources ?? {};
  for (const id of Object.keys(sources)) {
    const type = sources[id]?.type;
    if (type !== "vector" && type !== "raster" && type !== "raster-dem") {
      continue;
    }
    try {
      // GL JS v3.13+ public API.
      if (typeof map.refreshTiles === "function") {
        map.refreshTiles(id);
        continue;
      }
      const cache = map.style?.getSourceCache?.(id) ?? map.style?._sourceCaches?.[`other:${id}`];
      if (cache?.clearTiles) {
        cache.clearTiles();
        cache.update?.(map.transform);
      }
    } catch {
      /* a single source failing to refresh must not break the loop */
    }
  }
  try {
    map.triggerRepaint?.();
  } catch {
    /* noop */
  }
};

export const createTileRetryController = (
  map: AnyMap,
  options: TileRetryOptions = {},
): TileRetryController => {
  const {
    maxAttempts = 5,
    baseDelayMs = 800,
    maxDelayMs = 15000,
    onRecovered,
    onExhausted,
    onRetry,
  } = options;

  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending = false;
  let disposed = false;

  const clearTimer = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const runRetry = () => {
    timer = null;
    if (disposed || !map) return;
    refreshTiledSources(map);
    // If nothing errors again within a short grace period we treat the
    // recovery as successful and reset the backoff.
    setTimeout(() => {
      if (disposed) return;
      if (pending) {
        pending = false;
        attempt = 0;
        onRecovered?.();
      }
    }, 4000);
  };

  const schedule = () => {
    if (timer || disposed) return;
    if (attempt >= maxAttempts) {
      pending = false;
      onExhausted?.();
      return;
    }
    attempt += 1;
    // Exponential backoff with jitter so many clients don't stampede.
    const delay = Math.min(
      maxDelayMs,
      baseDelayMs * 2 ** (attempt - 1) * (0.75 + Math.random() * 0.5),
    );
    pending = true;
    onRetry?.(attempt, Math.round(delay));
    timer = setTimeout(runRetry, delay);
  };

  const handleOnline = () => {
    if (disposed || !pending) return;
    // Connection is back: retry now instead of waiting out the backoff.
    clearTimer();
    runRetry();
  };

  if (typeof window !== "undefined") {
    window.addEventListener("online", handleOnline);
  }

  return {
    handleError: (err: any) => {
      if (disposed) return false;
      const url = urlOf(err);
      const looksLikeTile =
        typeof url === "string" || err?.sourceId || err?.tile;
      if (!looksLikeTile || !isTransient(err)) return false;
      schedule();
      return true;
    },
    notifySuccess: () => {
      pending = false;
      attempt = 0;
      clearTimer();
    },
    dispose: () => {
      disposed = true;
      clearTimer();
      if (typeof window !== "undefined") {
        window.removeEventListener("online", handleOnline);
      }
    },
  };
};
