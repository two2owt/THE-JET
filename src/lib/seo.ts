/**
 * Single source of truth for the canonical site origin.
 *
 * Must stay in sync with the canonical host enforced in `src/start.ts`
 * (apex redirects to www), otherwise canonical/og:url tags will point at a
 * host that immediately redirects — which search engines treat as a soft
 * canonical conflict.
 */
export const SITE_URL = "https://jet-around.com";

/** Absolute canonical URL for an app path (e.g. `/favorites`). */
export const canonicalUrl = (path: string): string =>
  `${SITE_URL}${path === "/" ? "" : path}`;
