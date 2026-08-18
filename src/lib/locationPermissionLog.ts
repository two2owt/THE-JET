/**
 * Append-only geolocation permission telemetry.
 *
 * `locationDiagnostics` keeps ONE snapshot row per user (current state).
 * This module writes an event per permission interaction into
 * `public.location_permission_events`, so we can answer questions like
 * "how many iOS users dismiss the prompt?" or "how often do we fall back to a
 * coarse network fix?" across iOS, Android and mobile web.
 *
 * No coordinates are ever stored here.
 */

import { supabase } from "@/integrations/supabase/client";
import { getPlatform, isNativeApp } from "@/lib/platform";

export type GeoPermissionOutcome =
  | "prompt_shown"
  | "granted"
  | "denied"
  | "dismissed"
  | "unsupported"
  | "suppressed"
  | "settings_opened"
  | "fallback_used";

export type GeoPermissionMethod =
  | "capacitor"
  | "permissions_api"
  | "get_current_position"
  | "network_fallback"
  | "ip_fallback"
  | "ui";

export type GeoPermissionEvent = {
  outcome: GeoPermissionOutcome;
  /** Where in the UI this happened: "map_banner", "prompt", "settings", ... */
  surface?: string;
  method?: GeoPermissionMethod;
  durationMs?: number;
  promptSuppressed?: boolean;
  fallbackUsed?: boolean;
  detail?: string;
};

/** "ios" | "android" | "web", suffixed for native shells. */
export const permissionPlatform = (): string => {
  const base = getPlatform();
  return isNativeApp() ? `${base}_native` : `${base}_browser`;
};

/**
 * Fire-and-forget. Never throws and never blocks the caller — telemetry must
 * not be able to break a permission flow.
 */
export const logGeoPermissionEvent = (event: GeoPermissionEvent): void => {
  if (typeof window === "undefined") return;
  void (async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user?.id;
      if (!userId) return; // anonymous visitors are not tracked
      await supabase.from("location_permission_events").insert({
        user_id: userId,
        platform: permissionPlatform(),
        surface: event.surface ?? null,
        outcome: event.outcome,
        method: event.method ?? null,
        duration_ms:
          typeof event.durationMs === "number"
            ? Math.max(0, Math.round(event.durationMs))
            : null,
        prompt_suppressed: event.promptSuppressed ?? false,
        fallback_used:
          event.fallbackUsed ?? event.outcome === "fallback_used",
        detail: event.detail ? event.detail.slice(0, 300) : null,
        user_agent:
          typeof navigator !== "undefined"
            ? navigator.userAgent.slice(0, 300)
            : null,
      });
    } catch (e) {
      if (import.meta.env.DEV)
        console.warn("[geo-permission-log] insert failed", e);
    }
  })();
};

export default logGeoPermissionEvent;
