/**
 * Fired the moment platform geolocation permission flips to "granted".
 *
 * The map listens for this so it can recenter on the user and reload the
 * heat/flow layers immediately, without waiting for the next poll or a
 * manual "use my location" tap.
 */
export const GEO_GRANTED_EVENT = "jet:geolocation-granted";

export function emitGeolocationGranted() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(GEO_GRANTED_EVENT));
}