/**
 * Ambient declarations for the non-standard globals JET actually uses.
 *
 * These exist so app code can read `window.__mapboxToken` or
 * `navigator.connection` without an `as any` escape hatch on every access.
 */

import type * as MapboxGL from "mapbox-gl";

declare global {
  /** Subset of the Network Information API we branch on. */
  interface NetworkInformation {
    readonly saveData?: boolean;
    readonly effectiveType?: "slow-2g" | "2g" | "3g" | "4g";
    readonly downlink?: number;
    readonly rtt?: number;
  }

  interface Navigator {
    readonly connection?: NetworkInformation;
  }

  interface Window {
    /** Mapbox GL loaded from the CDN script tag (version-pinned). */
    mapboxgl?: typeof MapboxGL;
    /** Cached Mapbox access token (see lib/mapboxTokenCache). */
    __mapboxToken?: string;
    /** In-flight token fetch, shared across concurrent callers. */
    __mapboxTokenPromise?: Promise<string | null>;
    /** SSR/prefetch payload handed to the client on first paint. */
    __PREFETCHED_DATA__?: Record<string, unknown> | undefined;
  }
}

export {};
