import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLocationPreferences } from "@/hooks/useLocationPreferences";
import { isNativeApp } from "@/lib/platform";

/**
 * Streams the signed-in user's location into `public.user_locations`
 * so the density/paths/live-stats realtime feeds have data to render.
 *
 * Gating (all must hold):
 * - user is signed in
 * - `user_preferences.location_tracking_enabled` is true
 * Tracking is session-scoped: once a user signs in it runs on EVERY route and
 * keeps contributing points until they sign out (or turn tracking off in
 * settings). `user_preferences.background_tracking_enabled` additionally keeps
 * the watcher fed while the app is backgrounded on native
 * (Capacitor `Geolocation.watchPosition`); on the web a resume-on-visibility
 * fix-up plus a slow poll always runs so throttled/hidden tabs still report.
 *
 * - Silently no-ops when the user is signed out, when geolocation isn't
 *   available, or when the browser has already denied permission — never
 *   triggers a permission prompt (that stays in `LocationPermissionPrompt`).
 * - Debounces writes: min 60s between inserts, and only when the user has
 *   moved > ~20m OR 5 min has elapsed, to keep the table lean while still
 *   feeding realtime updates.
 */

const MIN_WRITE_INTERVAL_MS = 60_000;
const MAX_WRITE_INTERVAL_MS = 5 * 60_000;
const MIN_MOVE_METERS = 20;

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const toRad = (n: number) => (n * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export const useLocationTracker = () => {
  const { session } = useAuth();
  const { locationTrackingEnabled, backgroundTrackingEnabled } = useLocationPreferences();
  const watchIdRef = useRef<number | null>(null);
  const nativeWatchIdRef = useRef<string | null>(null);
  const lastWriteAtRef = useRef<number>(0);
  const lastCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const inFlightRef = useRef(false);

  const backgroundEnabled = locationTrackingEnabled && backgroundTrackingEnabled;
  // Signed in + tracking allowed is enough — no route/foreground gate.
  const enabled = locationTrackingEnabled;

  useEffect(() => {
    const userId = session?.user?.id;
    if (!enabled || !userId) return;
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) return;

    let cancelled = false;
    let resumeHandler: (() => void) | null = null;
    let backgroundPoll: ReturnType<typeof setInterval> | null = null;

    const maybeWrite = async (lat: number, lng: number, accuracy: number | null) => {
      if (cancelled || inFlightRef.current) return;
      const now = Date.now();
      const sinceLast = now - lastWriteAtRef.current;
      const prev = lastCoordsRef.current;
      const moved = prev ? haversineMeters(prev, { lat, lng }) : Infinity;

      if (sinceLast < MIN_WRITE_INTERVAL_MS) return;
      if (sinceLast < MAX_WRITE_INTERVAL_MS && moved < MIN_MOVE_METERS) return;

      inFlightRef.current = true;
      try {
        // Re-check the session right before writing: a sign-out can land in
        // the gap between the geolocation callback and this insert.
        const { data } = await supabase.auth.getSession();
        if (cancelled || data.session?.user?.id !== userId) return;
        const { error } = await supabase.from("user_locations").insert({
          user_id: userId,
          latitude: lat,
          longitude: lng,
          accuracy: accuracy ?? null,
        });
        if (!error) {
          lastWriteAtRef.current = now;
          lastCoordsRef.current = { lat, lng };
        } else if (import.meta.env.DEV) {
          console.warn("[location-tracker] insert failed", error);
        }
      } finally {
        inFlightRef.current = false;
      }
    };

    const startNative = async () => {
      try {
        const { Geolocation } = await import("@capacitor/geolocation");
        const perms = await Geolocation.checkPermissions();
        // Background tracking needs the coarse/fine "location" grant; we never
        // prompt from here — the permission prompt stays user-initiated.
        const granted =
          perms.location === "granted" || (backgroundEnabled && perms.coarseLocation === "granted");
        if (!granted || cancelled) return;

        nativeWatchIdRef.current = await Geolocation.watchPosition(
          { enableHighAccuracy: false, timeout: 20_000, maximumAge: 30_000 },
          (pos, err) => {
            if (err || !pos) return;
            void maybeWrite(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy ?? null);
          },
        );
      } catch (err) {
        if (import.meta.env.DEV) console.warn("[location-tracker] native watch failed", err);
      }
    };

    const startWeb = async () => {
      // Only track when permission is already granted — never prompt from here.
      try {
        const status = await navigator.permissions?.query?.({
          name: "geolocation" as PermissionName,
        });
        if (status && status.state !== "granted") return;
      } catch {
        // Permissions API unsupported — proceed; watchPosition errors will
        // silently no-op below without prompting again if already denied.
      }

      if (cancelled) return;

      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          void maybeWrite(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
        },
        (err) => {
          if (import.meta.env.DEV) console.warn("[location-tracker] watch error", err.message);
        },
        { enableHighAccuracy: false, maximumAge: 30_000, timeout: 20_000 }
      );

      // Browsers throttle (or freeze) `watchPosition` callbacks for hidden
      // tabs (and some browsers stall it on inactive routes), so top up with an
      // explicit fix on a slow poll and whenever the tab becomes visible again.
      // Both go through the same write throttle, so this adds no extra rows.
      const requestFix = () => {
        if (cancelled) return;
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            void maybeWrite(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
          },
          () => {},
          { enableHighAccuracy: false, maximumAge: 60_000, timeout: 20_000 },
        );
      };

      backgroundPoll = setInterval(requestFix, MAX_WRITE_INTERVAL_MS);
      resumeHandler = () => {
        if (document.visibilityState === "visible") requestFix();
      };
      document.addEventListener("visibilitychange", resumeHandler);
    };

    const start = isNativeApp() ? startNative : startWeb;

    void start();

    return () => {
      cancelled = true;
      if (backgroundPoll) clearInterval(backgroundPoll);
      if (resumeHandler) document.removeEventListener("visibilitychange", resumeHandler);
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (nativeWatchIdRef.current !== null) {
        const id = nativeWatchIdRef.current;
        nativeWatchIdRef.current = null;
        void import("@capacitor/geolocation")
          .then(({ Geolocation }) => Geolocation.clearWatch({ id }))
          .catch(() => {});
      }
    };
  }, [enabled, backgroundEnabled, session?.user?.id]);
};

export default useLocationTracker;