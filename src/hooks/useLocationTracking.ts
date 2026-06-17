import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  requestLocationPermission,
  toastPermissionResult,
} from "@/lib/permissions";

/** Minimum meters moved before posting a new fix. */
const MIN_DISTANCE_METERS = 75;
/** Minimum time between posts even if user is stationary. */
const MIN_INTERVAL_MS = 2 * 60 * 1000;
/** Ignore fixes worse than this (meters). */
const MAX_ACCURACY_METERS = 250;

function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Watches the device's geolocation and persists fresh fixes to the
 * `check-geofence` edge function (which writes to `user_locations` and
 * triggers neighborhood entry notifications).
 *
 * - Only runs while the user is authenticated.
 * - Throttled by distance ({@link MIN_DISTANCE_METERS}) and time
 *   ({@link MIN_INTERVAL_MS}).
 * - Skips low-accuracy fixes (>{@link MAX_ACCURACY_METERS} m).
 * - Silent on permission denial — no UI side effects.
 */
export function useLocationTracking() {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const lastSentRef = useRef<{ lat: number; lng: number; at: number } | null>(
    null,
  );
  const inFlightRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  // Load the user's location_tracking_enabled preference. Defaults to ON
  // (matches the DB default) so first-time users are auto-tracked until they
  // explicitly disable it in Profile Settings.
  useEffect(() => {
    // Wipe throttle memory whenever the signed-in user changes so a
    // previously signed-in user's last fix can't suppress the next user's
    // first post after sign-in.
    lastSentRef.current = null;

    if (!user?.id) {
      setEnabled(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("user_preferences")
        .select("location_tracking_enabled")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      setEnabled(data?.location_tracking_enabled ?? true);
    })();

    // React to live preference changes (e.g. user toggles off in settings).
    const channel = supabase
      .channel(`user_preferences:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_preferences",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const next =
            (payload.new as { location_tracking_enabled?: boolean } | null)
              ?.location_tracking_enabled;
          if (typeof next === "boolean") setEnabled(next);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    if (enabled !== true) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    let watchId: number | null = null;
    let cancelled = false;

    // Ask iOS/Android (or browser) for permission up-front. On denial we
    // surface an actionable toast pointing the user at Settings instead of
    // silently failing.
    void (async () => {
      const result = await requestLocationPermission();
      if (cancelled) return;
      if (result.status !== "granted") {
        const retry = () => {
          void requestLocationPermission().then((r) =>
            toastPermissionResult("Location", r),
          );
        };
        toastPermissionResult("Location", result, retry);
      }
    })();

    const postFix = async (
      latitude: number,
      longitude: number,
      accuracy: number | null,
    ) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        if (controller.signal.aborted) return;
        // Pass AbortSignal so flipping the toggle / unmount cancels the
        // pending request mid-flight instead of letting it land.
        await supabase.functions.invoke("check-geofence", {
          body: { latitude, longitude, accuracy },
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        lastSentRef.current = {
          lat: latitude,
          lng: longitude,
          at: Date.now(),
        };
      } catch (err) {
        if (controller.signal.aborted) return; // expected on disable/unmount
        // Network or auth errors are non-fatal — try again on next fix.
        console.warn("[useLocationTracking] check-geofence failed", err);
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        inFlightRef.current = false;
      }
    };

    const onFix = (pos: GeolocationPosition) => {
      if (cancelled) return;
      const { latitude, longitude, accuracy } = pos.coords;

      if (
        typeof accuracy === "number" &&
        accuracy > 0 &&
        accuracy > MAX_ACCURACY_METERS
      ) {
        return;
      }

      const last = lastSentRef.current;
      if (last) {
        const moved = haversineMeters(last.lat, last.lng, latitude, longitude);
        const elapsed = Date.now() - last.at;
        if (moved < MIN_DISTANCE_METERS && elapsed < MIN_INTERVAL_MS) return;
      }

      void postFix(latitude, longitude, accuracy ?? null);
    };

    const onError = (err: GeolocationPositionError) => {
      if (err.code === err.PERMISSION_DENIED) {
        // Stop watching and surface actionable guidance.
        if (watchId !== null) {
          navigator.geolocation.clearWatch(watchId);
          watchId = null;
        }
        toastPermissionResult("Location", {
          status: "blocked",
          message:
            "Location access was revoked. Re-enable it in Settings to keep getting nearby deal alerts.",
          requiresSettings: true,
        });
      }
    };

    // Immediate one-shot fix on mount so we record presence promptly.
    navigator.geolocation.getCurrentPosition(onFix, onError, {
      enableHighAccuracy: false,
      maximumAge: 60_000,
      timeout: 15_000,
    });

    // Continuous watch for movement.
    watchId = navigator.geolocation.watchPosition(onFix, onError, {
      enableHighAccuracy: true,
      maximumAge: 30_000,
      timeout: 30_000,
    });

    return () => {
      cancelled = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      // Cancel any in-flight check-geofence request so a stale fix can't
      // land in user_locations after the user opted out.
      abortRef.current?.abort();
      abortRef.current = null;
      inFlightRef.current = false;
    };
  }, [user?.id, enabled]);
}