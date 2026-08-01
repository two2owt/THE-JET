/**
 * Triggers the browser's native geolocation permission dialog.
 *
 * Must be called from a real user gesture (e.g. ticking the location-consent
 * checkbox at signup) — browsers ignore/suppress prompts otherwise.
 *
 * No-ops when geolocation is unavailable or the permission has already been
 * decided (granted or denied), so it never nags. Also records that we asked,
 * so the in-app `LocationPermissionPrompt` doesn't double-ask later.
 */
const ASKED_KEY = "location-permission-prompt-asked";
const DISMISS_KEY = "location-permission-prompt-dismissed";

export async function requestGeolocationPermission(): Promise<
  "granted" | "denied" | "unavailable" | "already-decided"
> {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) return "unavailable";

  try {
    const status = await navigator.permissions?.query?.({ name: "geolocation" as PermissionName });
    if (status && status.state !== "prompt") return "already-decided";
  } catch {
    // Permissions API unsupported — fall through and ask once.
  }

  try {
    localStorage.setItem(ASKED_KEY, "1");
  } catch {
    /* storage blocked — harmless */
  }

  const granted = await new Promise<boolean>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      () => resolve(true),
      () => resolve(false),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  });

  try {
    if (granted) localStorage.removeItem(DISMISS_KEY);
    else localStorage.setItem(DISMISS_KEY, Date.now().toString());
  } catch {
    /* storage blocked — harmless */
  }

  return granted ? "granted" : "denied";
}

export default requestGeolocationPermission;
