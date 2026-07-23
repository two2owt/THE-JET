import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Canonical base URL for Supabase auth email links and OAuth redirects.
 *
 * Only a fixed allowlist of origins may be returned so that every redirect
 * URL matches Supabase's configured redirect allow-list. Anything unknown
 * (localhost, ephemeral preview domains, tunnels, custom staging hosts,
 * SSR/no-window contexts) is forced to the production origin instead of
 * leaking `window.location.origin`.
 */
// The live app is served from jet-around.lovable.app. jet-around.com is
// reserved for a future custom domain — once its DNS + Lovable custom domain
// is wired up, OAuth automatically follows because Lovable-managed OAuth
// includes every attached custom domain in the redirect allow-list.
const PRODUCTION_URL = "https://jet-around.lovable.app";

// Exact hostnames that are safe to redirect back to as-is. Add new custom
// domains here the same day they're attached in Project Settings → Domains
// so OAuth `redirect_uri` matches the origin the user is actually browsing.
const ALLOWED_EXACT_HOSTS = new Set<string>([
  "jet-around.lovable.app",
  "jet-around.com",
  "www.jet-around.com",
]);

// Suffix allow-list. Any Lovable-managed subdomain (published slug, preview,
// id-preview, workspace) is served by the same app and is included in the
// managed OAuth redirect allow-list, so it's safe to redirect back to.
const ALLOWED_HOST_SUFFIXES = [".lovable.app", ".lovable.dev"];

const isAllowedHost = (host: string): boolean => {
  if (ALLOWED_EXACT_HOSTS.has(host)) return true;
  return ALLOWED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
};

export const getAppUrl = (): string => {
  if (typeof window === "undefined" || !window.location?.hostname) {
    return PRODUCTION_URL;
  }
  const host = window.location.hostname.toLowerCase();
  if (isAllowedHost(host)) {
    return `${window.location.protocol}//${window.location.host}`;
  }
  // Unknown host (localhost, tunnels, forks) → send Supabase links to the
  // live published origin so `redirect_uri` always resolves to a page that
  // actually renders the app and passes the OAuth allow-list check.
  return PRODUCTION_URL;
};

/**
 * Build a safe absolute redirect URL for Supabase auth flows
 * (`emailRedirectTo`, OAuth `redirect_uri`, `resetPasswordForEmail.redirectTo`).
 *
 * - Base is always {@link getAppUrl} — never `window.location.origin`.
 * - `path` is normalized to a single leading slash and its segments are
 *   percent-encoded via the URL API (never string-concatenated).
 * - `params` are appended through URLSearchParams so keys/values are
 *   URL-encoded and cannot smuggle `&`, `#`, spaces, or unicode into the
 *   query string.
 * - Any hash/query already present in `path` is dropped; only structured
 *   `params` become the final query string. This prevents malformed
 *   `redirect_uri` values that would fail Supabase's allow-list check.
 */
export const buildAuthRedirectUrl = (
  path: string,
  params?: Record<string, string | number | boolean | undefined | null>,
): string => {
  const base = getAppUrl();
  // Strip any query/hash the caller may have accidentally embedded.
  const cleanPath = String(path ?? "/").split("#")[0].split("?")[0];
  // Normalize to exactly one leading slash, encode each segment.
  const segments = cleanPath.split("/").filter(Boolean).map(encodeURIComponent);
  const pathname = "/" + segments.join("/");
  const url = new URL(pathname, base);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
};