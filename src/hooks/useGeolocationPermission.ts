import { useCallback, useEffect, useRef, useState } from "react";
import { isNativeApp } from "@/lib/platform";
import { emitGeolocationGranted } from "@/lib/geolocationGrantEvent";
import {
  clearPromptSuppression,
  isPromptSuppressed,
  recordPromptAttempt,
  subscribeToPromptSuppression,
} from "@/lib/geolocationPromptSuppression";

/** Non-standard Permissions API with one-tap request(), available in Chrome. */
type PermissionsWithRequest = Permissions & {
  request(permission: { name: PermissionName }): Promise<PermissionStatus>;
};

export type GeoPermissionState =
  | "unknown"
  | "unsupported"
  | "prompt"
  | "granted"
  | "denied";

/**
 * Live browser/OS geolocation permission state.
 *
 * The stored `location_tracking_enabled` preference only means "the user asked
 * for tracking" — nothing is actually collected until the platform grants the
 * permission. UI should treat tracking as OFF whenever this is not "granted".
 */
export function useGeolocationPermission() {
  const [state, setRawState] = useState<GeoPermissionState>("unknown");
  const [promptSuppressed, setPromptSuppressed] = useState(false);
  // Tracks the last observed state so we only announce real transitions
  // into "granted" (not repeated re-reads of an already-granted permission).
  const prevStateRef = useRef<GeoPermissionState>("unknown");

  const setState = useCallback((next: GeoPermissionState) => {
    const prev = prevStateRef.current;
    prevStateRef.current = next;
    setRawState(next);
    if (next === "granted" || next === "denied") {
      // A real decision exists — prompting is no longer the blocker.
      clearPromptSuppression();
      setPromptSuppressed(false);
    }
    if (next === "granted" && prev !== "granted") emitGeolocationGranted();
  }, []);

  const refresh = useCallback(async () => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setState("unsupported");
      return "unsupported" as const;
    }
    if (isNativeApp()) {
      try {
        const { Geolocation } = await import("@capacitor/geolocation");
        const res = await Geolocation.checkPermissions();
        const loc = res.location ?? res.coarseLocation;
        const next: GeoPermissionState =
          loc === "granted"
            ? "granted"
            : loc === "denied"
              ? "denied"
              : "prompt";
        setState(next);
        return next;
      } catch {
        setState("unknown");
        return "unknown" as const;
      }
    }
    if (!navigator.permissions?.query) {
      setState("unknown");
      return "unknown" as const;
    }
    try {
      const status = await navigator.permissions.query({
        name: "geolocation" as PermissionName,
      });
      setState(status.state as GeoPermissionState);
      return status.state as GeoPermissionState;
    } catch {
      setState("unknown");
      return "unknown" as const;
    }
  }, [setState]);

  useEffect(() => {
    let cancelled = false;
    let status: PermissionStatus | null = null;
    const onChange = () => {
      if (!cancelled && status) setState(status.state as GeoPermissionState);
    };

    void refresh();

    if (
      typeof navigator !== "undefined" &&
      navigator.permissions?.query &&
      !isNativeApp()
    ) {
      navigator.permissions
        .query({ name: "geolocation" as PermissionName })
        .then((s) => {
          if (cancelled) return;
          status = s;
          s.addEventListener("change", onChange);
        })
        .catch(() => {});
    }

    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      status?.removeEventListener("change", onChange);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh, setState]);

  // Hydrate + track suppression flag (client-only, avoids SSR mismatch).
  useEffect(() => {
    setPromptSuppressed(isPromptSuppressed());
    return subscribeToPromptSuppression(() =>
      setPromptSuppressed(isPromptSuppressed()),
    );
  }, []);

  /**
   * Triggers the native/browser permission prompt (user gesture required).
   *
   * Uses the Permissions API `request()` one-tap flow when available (Chrome
   * family on Android/desktop), otherwise falls back to the legacy
   * `getCurrentPosition()` prompt. On native shells it routes through the
   * Capacitor Geolocation plugin.
   */
  const request = useCallback(async () => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator))
      return "unsupported" as const;

    if (isNativeApp()) {
      try {
        const { Geolocation } = await import("@capacitor/geolocation");
        const res = await Geolocation.requestPermissions();
        const loc = res.location ?? res.coarseLocation;
        const next: GeoPermissionState =
          loc === "granted" ? "granted" : loc === "denied" ? "denied" : "prompt";
        setState(next);
        return next;
      } catch {
        return refresh();
      }
    }

    const startedAt = Date.now();

    // One-tap Permissions API request, supported in Chrome/Android.
    const permissionsApi = navigator.permissions as
      | PermissionsWithRequest
      | undefined;
    if (typeof permissionsApi?.request === "function") {
      try {
        const status = (await permissionsApi.request({
          name: "geolocation" as PermissionName,
        })) as PermissionStatus;
        const next = status.state as GeoPermissionState;
        setState(next);
        recordPromptAttempt({
          outcome: next,
          durationMs: Date.now() - startedAt,
        });
        return next;
      } catch {
        // Fall through to legacy prompt if the API throws or is unsupported.
      }
    }

    const deniedError = await new Promise<boolean>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        () => resolve(false),
        (err) => resolve(err?.code === 1),
        { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 },
      );
    });
    const next = await refresh();
    recordPromptAttempt({
      outcome: next,
      durationMs: Date.now() - startedAt,
      deniedError,
    });
    return next;
  }, [refresh, setState]);

  return {
    permission: state,
    isGranted: state === "granted",
    isBlocked: state === "denied",
    /** Browser will not surface the permission prompt again. */
    promptSuppressed: promptSuppressed && state !== "granted",
    /** True only when a prompt can still realistically appear. */
    canPrompt:
      !promptSuppressed && (state === "prompt" || state === "unknown"),
    /** Retrying the prompt is pointless — send the user to settings. */
    mustUseSettings: state === "denied" || (promptSuppressed && state !== "granted"),
    refresh,
    request,
  };
}

export default useGeolocationPermission;
