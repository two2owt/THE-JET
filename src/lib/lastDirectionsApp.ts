import type { DirectionsApp } from "@/lib/directions-url";

const STORAGE_KEY = "jet:last-directions-app";
const VALID: DirectionsApp[] = ["google", "apple", "waze"];

/** Reads the user's last-used navigation app, if any. */
export function getLastDirectionsApp(): DirectionsApp | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return VALID.includes(value as DirectionsApp)
      ? (value as DirectionsApp)
      : null;
  } catch {
    return null;
  }
}

/** Persists the navigation app the user just picked. */
export function setLastDirectionsApp(app: DirectionsApp): void {
  try {
    localStorage.setItem(STORAGE_KEY, app);
  } catch {
    // Storage unavailable (private mode / blocked) — preference just won't stick.
  }
}
