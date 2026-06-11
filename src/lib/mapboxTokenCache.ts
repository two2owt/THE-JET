/**
 * Shared Mapbox token cache primitives. Used by both the runtime hook
 * (`useMapboxToken`) and the idle-time prefetcher (`prefetch.ts`) so the
 * cache key / TTL never drift between call sites — drift here has already
 * caused one rotation bug (note the `_v2` suffix on the storage key).
 */

export const MAPBOX_TOKEN_CACHE_KEY = "mapbox_token_cache_v2";
export const MAPBOX_TOKEN_CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24h

export interface CachedMapboxToken {
  token: string;
  timestamp: number;
}

/** Read the cache from local/sessionStorage; returns null if missing/expired/invalid. */
export const readMapboxTokenCache = (): string | null => {
  try {
    const raw =
      localStorage.getItem(MAPBOX_TOKEN_CACHE_KEY) ||
      sessionStorage.getItem(MAPBOX_TOKEN_CACHE_KEY);
    if (!raw) return null;
    const { token, timestamp } = JSON.parse(raw) as CachedMapboxToken;
    const isExpired =
      Date.now() - timestamp > MAPBOX_TOKEN_CACHE_DURATION_MS;
    if (isExpired || typeof token !== "string" || !token.startsWith("pk.")) {
      clearMapboxTokenCache();
      return null;
    }
    return token;
  } catch {
    return null;
  }
};

/** Persist token to both local + sessionStorage (mobile redundancy). */
export const writeMapboxTokenCache = (token: string): void => {
  try {
    const payload: CachedMapboxToken = { token, timestamp: Date.now() };
    const json = JSON.stringify(payload);
    localStorage.setItem(MAPBOX_TOKEN_CACHE_KEY, json);
    sessionStorage.setItem(MAPBOX_TOKEN_CACHE_KEY, json);
  } catch {
    /* storage disabled — ignore */
  }
};

export const clearMapboxTokenCache = (): void => {
  try {
    localStorage.removeItem(MAPBOX_TOKEN_CACHE_KEY);
    sessionStorage.removeItem(MAPBOX_TOKEN_CACHE_KEY);
  } catch {
    /* storage disabled — ignore */
  }
};