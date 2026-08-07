import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLocationPreferences } from "@/hooks/useLocationPreferences";
import { isNativeApp } from "@/lib/platform";
import { createLocationSmoother, haversineMeters } from "@/lib/geo-smoothing";
import { getNetworkLocation } from "@/lib/networkGeolocation";
import { logGeoEvent } from "@/lib/geoDiagnostics";

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
 * - Every raw fix passes through `createLocationSmoother` first (accuracy gate,
 *   implausible-speed rejection, stationary noise floor, accuracy-weighted EMA
 *   and ~1m grid snapping) so jittery GPS can't smear or over-densify the
 *   heatmap.
 * - Debounces writes: min 60s between inserts, and only when the smoothed
 *   position has moved > ~20m OR 5 min has elapsed, to keep the table lean
 *   while still feeding realtime updates.
 */

const MIN_WRITE_INTERVAL_MS = 60_000;
const MAX_WRITE_INTERVAL_MS = 5 * 60_000;
const MIN_MOVE_METERS = 20;
/** Ignore raw fixes arriving faster than this — GPS bursts add no signal. */
const MIN_SAMPLE_INTERVAL_MS = 5_000;
/** How often the coarse Google Geolocation fallback may run. */
const NETWORK_FALLBACK_INTERVAL_MS = 5 * 60_000;
/** Grace period letting GPS report before any coarse fallback is attempted. */
const NETWORK_FALLBACK_GRACE_MS = 90_000;
/** Coarse fixes need a bigger move before they're worth another row. */
const NETWORK_MIN_MOVE_METERS = 150;

export const useLocationTracker = () => {
  const { session } = useAuth();
  const { locationTrackingEnabled, backgroundTrackingEnabled } = useLocationPreferences();
  const watchIdRef = useRef<number | null>(null);
  const nativeWatchIdRef = useRef<string | null>(null);
  const lastWriteAtRef = useRef<number>(0);
  const lastCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const inFlightRef = useRef(false);
  const lastSampleAtRef = useRef(0);
  const smootherRef = useRef(createLocationSmoother());
  // Bumped whenever the browser geolocation permission flips (e.g. the user
  // taps "Enable location" in the first-run prompt) so tracking starts for
  // that user immediately instead of waiting for the next mount.
  const [permissionTick, setPermissionTick] = useState(0);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.permissions?.query) return;
    let status: PermissionStatus | null = null;
    const onChange = () => setPermissionTick((n) => n + 1);
    navigator.permissions
      .query({ name: "geolocation" as PermissionName })
      .then((s) => {
        status = s;
        s.addEventListener("change", onChange);
      })
      .catch(() => {});
    return () => status?.removeEventListener("change", onChange);
  }, []);

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
    let networkPoll: ReturnType<typeof setInterval> | null = null;
    let networkGrace: ReturnType<typeof setTimeout> | null = null;

    const maybeWrite = async (rawLat: number, rawLng: number, rawAccuracy: number | null) => {
      if (cancelled || inFlightRef.current) return;
      const now = Date.now();

      // Throttle raw sampling before doing any work — some devices fire
      // watchPosition several times per second.
      if (now - lastSampleAtRef.current < MIN_SAMPLE_INTERVAL_MS) return;
      lastSampleAtRef.current = now;

      logGeoEvent({
        kind: "fix",
        source: "gps",
        fallbackUsed: false,
        accuracy: rawAccuracy,
        lat: rawLat,
        lng: rawLng,
      });

      // Smooth/deny noisy fixes before they can become a row.
      const fix = smootherRef.current.push({
        lat: rawLat,
        lng: rawLng,
        accuracy: rawAccuracy,
        timestamp: now,
      });
      if (!fix) {
        logGeoEvent({
          kind: "rejected",
          source: "gps",
          fallbackUsed: false,
          accuracy: rawAccuracy,
          reason: "smoother rejected (accuracy/speed/noise gate)",
        });
        return;
      }
      const { lat, lng, accuracy } = fix;

      const sinceLast = now - lastWriteAtRef.current;
      const prev = lastCoordsRef.current;
      const moved = prev ? haversineMeters(prev, { lat, lng }) : Infinity;

      if (sinceLast < MIN_WRITE_INTERVAL_MS) {
        logGeoEvent({
          kind: "skipped",
          source: "gps",
          fallbackUsed: false,
          accuracy,
          movedMeters: moved,
          reason: "min write interval not elapsed",
        });
        return;
      }
      if (sinceLast < MAX_WRITE_INTERVAL_MS && moved < MIN_MOVE_METERS) {
        logGeoEvent({
          kind: "skipped",
          source: "gps",
          fallbackUsed: false,
          accuracy,
          movedMeters: moved,
          reason: `moved < ${MIN_MOVE_METERS}m`,
        });
        return;
      }

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
          logGeoEvent({
            kind: "write",
            source: "gps",
            fallbackUsed: false,
            accuracy,
            lat,
            lng,
            movedMeters: moved,
          });
        } else {
          logGeoEvent({
            kind: "write-failed",
            source: "gps",
            fallbackUsed: false,
            accuracy,
            reason: error.message,
          });
        }
      } finally {
        inFlightRef.current = false;
      }
    };

    /**
     * Coarse Wi-Fi / cell / IP fix from the Google Geolocation API.
     * Bypasses the GPS smoother (its 100m accuracy gate would reject every
     * network fix) but keeps its own distance/time throttles so a stationary
     * user can't flood the table. Runs only when GPS has produced nothing
     * recently, so devices without a usable GPS signal still feed the heatmap
     * density and the venue-to-venue movement paths.
     */
    const maybeWriteNetworkFix = async () => {
      if (cancelled || inFlightRef.current) return;
      const now = Date.now();
      if (now - lastWriteAtRef.current < NETWORK_FALLBACK_INTERVAL_MS) return;

      const fix = await getNetworkLocation();
      if (!fix || cancelled) return;

      logGeoEvent({
        kind: "fix",
        source: "network",
        fallbackUsed: true,
        accuracy: fix.accuracy,
        lat: fix.lat,
        lng: fix.lng,
        reason: "gps produced no recent write",
      });

      const prev = lastCoordsRef.current;
      const moved = prev ? haversineMeters(prev, fix) : Infinity;
      if (moved < NETWORK_MIN_MOVE_METERS && now - lastWriteAtRef.current < MAX_WRITE_INTERVAL_MS) {
        logGeoEvent({
          kind: "skipped",
          source: "network",
          fallbackUsed: true,
          accuracy: fix.accuracy,
          movedMeters: moved,
          reason: `moved < ${NETWORK_MIN_MOVE_METERS}m`,
        });
        return;
      }

      inFlightRef.current = true;
      try {
        const { data } = await supabase.auth.getSession();
        if (cancelled || data.session?.user?.id !== userId) return;
        const { error } = await supabase.from("user_locations").insert({
          user_id: userId,
          latitude: fix.lat,
          longitude: fix.lng,
          accuracy: fix.accuracy ?? null,
        });
        if (!error) {
          lastWriteAtRef.current = Date.now();
          lastCoordsRef.current = { lat: fix.lat, lng: fix.lng };
          logGeoEvent({
            kind: "write",
            source: "network",
            fallbackUsed: true,
            accuracy: fix.accuracy,
            lat: fix.lat,
            lng: fix.lng,
            movedMeters: moved,
          });
        } else {
          logGeoEvent({
            kind: "write-failed",
            source: "network",
            fallbackUsed: true,
            accuracy: fix.accuracy,
            reason: error.message,
          });
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

    // Always-on coarse fallback, but never before GPS has had a fair chance:
    // firing it on mount would store an ISP/Wi-Fi point (up to ~5km off) and
    // create phantom hotspots plus fake arrival paths to the real GPS fix.
    // The first attempt waits out the grace window and self-suppresses if a
    // GPS write landed in the meantime.
    networkGrace = setTimeout(() => {
      void maybeWriteNetworkFix();
      networkPoll = setInterval(() => {
        void maybeWriteNetworkFix();
      }, NETWORK_FALLBACK_INTERVAL_MS);
    }, NETWORK_FALLBACK_GRACE_MS);

    const stopAll = () => {
      cancelled = true;
      smootherRef.current.reset();
      lastSampleAtRef.current = 0;
      if (backgroundPoll) clearInterval(backgroundPoll);
      backgroundPoll = null;
      if (networkPoll) clearInterval(networkPoll);
      networkPoll = null;
      if (networkGrace) clearTimeout(networkGrace);
      networkGrace = null;
      if (resumeHandler) document.removeEventListener("visibilitychange", resumeHandler);
      resumeHandler = null;
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

    // Tear down the watchers the instant auth ends, without waiting for the
    // React re-render that clears `session` — no points after sign-out.
    const { data: authSub } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === "SIGNED_OUT" || !nextSession || nextSession.user?.id !== userId) {
        lastCoordsRef.current = null;
        lastWriteAtRef.current = 0;
        stopAll();
      }
    });

    return () => {
      authSub.subscription.unsubscribe();
      stopAll();
    };
  }, [enabled, backgroundEnabled, session?.user?.id, permissionTick]);
};

export default useLocationTracker;