import { ANALYTICS_EVENTS } from "@/lib/analyticsEvents";
import { analytics } from "@/lib/analytics";

/**
 * Canonical deep-link funnel events.
 *
 * Every JetCard deep link (share, favorites tap, deal tap, push open) funnels
 * through these helpers so the funnel can be measured end to end:
 *   Deep Link Shared → Deep Link Opened → (Deep Link Fallback | Deep Link Failed)
 */
export type DeepLinkSurface = "favorites" | "deals" | "push" | "map" | "share";
export type DeepLinkKind = "venue" | "deal";

/** How the JetCard state was rehydrated for an opened deep link. */
export type DeepLinkResolution =
  | "loaded_venues"
  | "favorite_snapshot"
  | "deal_record"
  | "city_center_fallback";

const base = (kind: DeepLinkKind, id: string, surface: DeepLinkSurface) => ({
  category: "deep_link",
  link_type: kind,
  target_id: id,
  surface,
});

/** A copyable deep link was generated and shared/copied. */
export function trackDeepLinkShared(
  kind: DeepLinkKind,
  id: string,
  surface: DeepLinkSurface,
  method: "native" | "clipboard" | "failed",
) {
  analytics.track(ANALYTICS_EVENTS.DEEP_LINK_SHARED, { ...base(kind, id, surface), method });
}

/** A deep link resolved to a JetCard. */
export function trackDeepLinkOpened(
  kind: DeepLinkKind,
  id: string,
  surface: DeepLinkSurface,
  resolution: DeepLinkResolution,
) {
  analytics.track(ANALYTICS_EVENTS.DEEP_LINK_OPENED, {
    ...base(kind, id, surface),
    resolution,
    fallback: resolution !== "loaded_venues",
  });
}

/** The link resolved, but only through a degraded path (e.g. city center). */
export function trackDeepLinkFallback(
  kind: DeepLinkKind,
  id: string,
  surface: DeepLinkSurface,
  resolution: DeepLinkResolution,
  reason: string,
) {
  analytics.track(ANALYTICS_EVENTS.DEEP_LINK_FALLBACK, {
    ...base(kind, id, surface),
    resolution,
    reason,
  });
}

/** The link could not be resolved at all ("Venue not found"). */
export function trackDeepLinkFailed(
  kind: DeepLinkKind,
  id: string,
  surface: DeepLinkSurface,
  reason: string,
) {
  analytics.track(ANALYTICS_EVENTS.DEEP_LINK_FAILED, { ...base(kind, id, surface), reason });
}

/**
 * Infers where an inbound deep link came from. Push taps carry `nid`
 * (inbox row id) appended by the service worker / native handler.
 */
export function inferDeepLinkSurface(
  search: URLSearchParams | string | null | undefined,
): DeepLinkSurface {
  const params =
    typeof search === "string" ? new URLSearchParams(search) : search;
  if (params?.get("nid")) return "push";
  if (params?.get("ref")) return "share";
  return "map";
}
