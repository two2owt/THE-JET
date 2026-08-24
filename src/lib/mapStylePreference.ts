/**
 * User preference for the map base style.
 *
 * "auto" derives light/dark from the device clock (the phone's local time),
 * which is the default. "light" / "dark" pin the basemap explicitly.
 *
 * The value is persisted in localStorage and broadcast through a custom event
 * so the settings panel and an already-mounted map stay in sync.
 */
import { useEffect, useState } from "react";

export type MapStylePreference = "light" | "dark" | "auto";

const STORAGE_KEY = "jet:map-style-preference";
const EVENT = "jet:map-style-preference-change";

export const DEFAULT_MAP_STYLE_PREFERENCE: MapStylePreference = "auto";

export function getMapStylePreference(): MapStylePreference {
  if (typeof window === "undefined") return DEFAULT_MAP_STYLE_PREFERENCE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "auto") return raw;
  } catch {
    /* storage unavailable */
  }
  return DEFAULT_MAP_STYLE_PREFERENCE;
}

export function setMapStylePreference(value: MapStylePreference) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new CustomEvent<MapStylePreference>(EVENT, { detail: value }));
}

/** Light basemap during dawn/day hours, dark at dusk/night. */
export function autoMapStyleForNow(now: Date = new Date()): "light" | "dark" {
  const hour = now.getHours();
  return hour >= 5 && hour < 17 ? "light" : "dark";
}

export function useMapStylePreference(): [
  MapStylePreference,
  (value: MapStylePreference) => void,
] {
  // Start from the default so SSR and the first client render agree, then
  // hydrate the stored value in an effect.
  const [preference, setPreference] = useState<MapStylePreference>(
    DEFAULT_MAP_STYLE_PREFERENCE,
  );

  useEffect(() => {
    setPreference(getMapStylePreference());
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<MapStylePreference>).detail;
      if (detail) setPreference(detail);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) setPreference(getMapStylePreference());
    };
    window.addEventListener(EVENT, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVENT, onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return [preference, setMapStylePreference];
}
