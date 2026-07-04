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