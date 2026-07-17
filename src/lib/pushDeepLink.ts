/**
 * Shared resolver for push-notification tap payloads.
 *
 * Both the web service worker (sw-push.js) and the native Capacitor
 * push handler funnel their notification `data` payload through this
 * function so tapping a push always lands on the same in-app route.
 *
 * Payload contract (server-side notify-* functions must match):
 *   - url:      optional absolute URL — pathname + search + hash are used
 *   - dealId:   optional deal id → `/?deal=<id>`
 *   - venueId:  optional venue id → `/?venue=<id>`
 *   - layers:   optional canonical layer string appended to preserve
 *               the heatmap toggle state (e.g. "density,paths").
 */
export function resolvePushDeepLink(
  data: Record<string, string | undefined | null> | null | undefined,
): string | null {
  if (!data) return "/";

  const layers = (data.layers ?? "").toString().trim();
  const appendLayers = (path: string) => {
    if (!layers) return path;
    const sep = path.includes("?") ? "&" : "?";
    return `${path}${sep}layers=${encodeURIComponent(layers)}`;
  };

  const rawUrl = (data.url ?? "").toString();
  if (rawUrl) {
    try {
      const parsed = new URL(rawUrl, "https://jet-around.com");
      const path = `${parsed.pathname || "/"}${parsed.search}${parsed.hash}`;
      return appendLayers(path);
    } catch {
      /* fall through */
    }
  }

  const dealId = (data.dealId ?? "").toString();
  if (dealId) return appendLayers(`/?deal=${encodeURIComponent(dealId)}`);

  const venueId = (data.venueId ?? "").toString();
  if (venueId) return appendLayers(`/?venue=${encodeURIComponent(venueId)}`);

  return appendLayers("/");
}