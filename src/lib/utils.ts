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
const PRODUCTION_URL = "https://jet-around.com";
const STAGING_URL = "https://jet-around.lovable.app";

// Hostnames that are safe to redirect back to as-is.
const ALLOWED_HOSTS: Record<string, string> = {
  "jet-around.com": PRODUCTION_URL,
  "www.jet-around.com": PRODUCTION_URL,
  "jet-around.lovable.app": STAGING_URL,
};

export const getAppUrl = (): string => {
  if (typeof window === "undefined" || !window.location?.hostname) {
    return PRODUCTION_URL;
  }
  const host = window.location.hostname.toLowerCase();
  const allowed = ALLOWED_HOSTS[host];
  if (allowed) return allowed;
  // Localhost, 127.0.0.1, id-preview--*.lovable.app, tunnels, anything else
  // → send Supabase links to production so redirect_uri always validates.
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