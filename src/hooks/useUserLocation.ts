import { useEffect, useSyncExternalStore } from "react";
import { hasConsent, subscribeConsent } from "@/lib/consent";

export type UserCoords = { lat: number; lng: number; accuracy?: number };

type State = {
  location: UserCoords | null;
  error: string | null;
  status: "idle" | "prompting" | "granted" | "denied" | "unsupported";
  updatedAt: number | null;
};

let state: State = {
  location: null,
  error: null,
  status: "idle",
  updatedAt: null,
};

const listeners = new Set<() => void>();
let watchId: number | null = null;
let started = false;

function setState(patch: Partial<State>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

function getSnapshot() {
  return state;
}

function onSuccess(pos: GeolocationPosition) {
  setState({
    location: {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
    },
    error: null,
    status: "granted",
    updatedAt: Date.now(),
  });
}

function onError(err: GeolocationPositionError) {
  setState({
    error: err.message || "Unable to access your location",
    status: err.code === err.PERMISSION_DENIED ? "denied" : state.status,
  });
}

/**
 * Kick off (or resume) continuous location tracking. Safe to call repeatedly.
 * Runs whether or not the user is authenticated; browser permission is the
 * source of truth. For signed-in users, the persisted `foreground_location`
 * consent still applies (see lib/consent.ts).
 */
export function startLocationTracking() {
  if (typeof window === "undefined") return;
  if (!("geolocation" in navigator)) {
    setState({ status: "unsupported", error: "Geolocation not supported" });
    return;
  }
  if (!hasConsent("foreground_location")) return;
  if (watchId !== null) return;

  setState({ status: state.status === "idle" ? "prompting" : state.status });

  navigator.geolocation.getCurrentPosition(onSuccess, onError, {
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 300000,
  });

  try {
    watchId = navigator.geolocation.watchPosition(onSuccess, onError, {
      enableHighAccuracy: true,
      timeout: 20000,
      maximumAge: 60000,
    });
  } catch (e) {
    console.warn("watchPosition failed:", e);
  }
}

export function stopLocationTracking() {
  if (watchId !== null && "geolocation" in navigator) {
    navigator.geolocation.clearWatch(watchId);
  }
  watchId = null;
}

/**
 * Ensures a single background tracker is running for the whole app. Mount
 * anywhere near the root — subsequent mounts are no-ops.
 */
export function useAutoStartLocationTracking() {
  useEffect(() => {
    if (started) return;
    started = true;

    startLocationTracking();

    // React to consent changes (sign-in flips foreground_location on/off).
    const unsub = subscribeConsent(() => {
      if (hasConsent("foreground_location")) {
        startLocationTracking();
      } else {
        stopLocationTracking();
      }
    });

    return () => {
      unsub();
    };
  }, []);
}

/** Read current tracked location + status. */
export function useUserLocation() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** One-shot manual request (e.g. from a "use my location" button). */
export function requestUserLocation() {
  startLocationTracking();
}
