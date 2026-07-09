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

// Throttle configuration — collapses noisy GPS updates so map layers,
// distance calcs, and re-renders only fire on meaningful movement.
const MIN_UPDATE_INTERVAL_MS = 5_000; // hard floor between emitted updates
const MIN_MOVEMENT_METERS = 15;        // ignore jitter smaller than this
const MAX_STALE_INTERVAL_MS = 60_000;  // always emit at least this often
let lastEmitAt = 0;
let pendingTimer: ReturnType<typeof setTimeout> | null = null;
let pendingCoords: { lat: number; lng: number; accuracy?: number } | null = null;

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function commit(next: { lat: number; lng: number; accuracy?: number }) {
  lastEmitAt = Date.now();
  pendingCoords = null;
  if (pendingTimer) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
  setState({
    location: next,
    error: null,
    status: "granted",
    updatedAt: lastEmitAt,
  });
}

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
  const next = {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracy: pos.coords.accuracy,
  };
  const now = Date.now();
  const prev = state.location;

  // First fix — commit immediately so consumers can render right away.
  if (!prev) {
    commit(next);
    return;
  }

  const movedMeters = haversineMeters(prev, next);
  const sinceLast = now - lastEmitAt;

  // Ignore sub-jitter updates unless we've gone too long without emitting.
  if (movedMeters < MIN_MOVEMENT_METERS && sinceLast < MAX_STALE_INTERVAL_MS) {
    return;
  }

  // Enforce a minimum interval; defer to a trailing-edge emit if too soon.
  if (sinceLast >= MIN_UPDATE_INTERVAL_MS) {
    commit(next);
    return;
  }

  pendingCoords = next;
  if (pendingTimer) return;
  pendingTimer = setTimeout(() => {
    pendingTimer = null;
    if (pendingCoords) commit(pendingCoords);
  }, MIN_UPDATE_INTERVAL_MS - sinceLast);
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
  if (pendingTimer) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
  pendingCoords = null;
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
