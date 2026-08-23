import { useCallback, useRef } from "react";

/**
 * How long an explicit recenter request stays valid. If the fix takes longer
 * than this (permission dialog left open, GPS cold start), the request is
 * treated as abandoned rather than firing a surprise camera move minutes later
 * while the user is browsing somewhere else.
 */
export const RECENTER_INTENT_TTL_MS = 30_000;

export type MapRecenterPolicy = {
  /** True only while an un-consumed, un-expired explicit request is pending. */
  recenterIntentRef: React.MutableRefObject<boolean>;
  /** True once the user panned/zoomed themselves since the last recenter. */
  userMovedCameraRef: React.MutableRefObject<boolean>;
  /** Marks an explicit user request to be taken to their own location. */
  requestRecenter: () => void;
  /** Consumes a pending request; false for passive position fixes. */
  consumeRecenterIntent: () => boolean;
};

/**
 * Centralises JET's camera-recenter policy.
 *
 * The camera may only fly to the user's own position on an *explicit* request:
 * the once-per-session locate after sign-in, the map's locate button, or
 * "Use my location" in the city selector. Everything else — the geolocate
 * control's continuous watch and our background city re-detection watcher — is
 * passive: it refreshes the marker and coordinates but never moves the camera,
 * because the user may be deliberately browsing another city.
 */
export const useMapRecenterPolicy = (): MapRecenterPolicy => {
  const recenterIntentRef = useRef(false);
  const userMovedCameraRef = useRef(false);
  const recenterIntentAtRef = useRef(0);

  const requestRecenter = useCallback(() => {
    recenterIntentRef.current = true;
    recenterIntentAtRef.current = Date.now();
    // A fresh recenter resets "the user is browsing elsewhere".
    userMovedCameraRef.current = false;
  }, []);

  const consumeRecenterIntent = useCallback(() => {
    const pending =
      recenterIntentRef.current &&
      Date.now() - recenterIntentAtRef.current < RECENTER_INTENT_TTL_MS;
    recenterIntentRef.current = false;
    return pending;
  }, []);

  return {
    recenterIntentRef,
    userMovedCameraRef,
    requestRecenter,
    consumeRecenterIntent,
  };
};
