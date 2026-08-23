/**
 * Pure presentation helpers for venue markers.
 *
 * These were previously inline closures inside `MapboxHeatmap.updateMarkers`,
 * re-created on every marker pass. They depend on nothing but their arguments,
 * so they live here: cheaper, testable, and the marker pass stays readable.
 */

import { resolveVenueCategory } from "@/lib/venue-categories";

export type FloralPalette = { light: string; dark: string };

/**
 * Category → botanical hue, with a light-basemap and dark-basemap variant so
 * glyphs stay legible on either style. Sourced from the shared category
 * taxonomy so markers, search chips and thumbnails never drift apart.
 */
export const getCategoryFloral = (category: string): FloralPalette => {
  const def = resolveVenueCategory(category);
  return { light: def.light, dark: def.dark };
};

/** Category → Lucide SVG path d-strings (24x24 viewBox). */
export const getCategoryIcon = (category: string): string =>
  resolveVenueCategory(category).svg;


/**
 * Zoom → marker scale factor. Keeps markers tappable when zoomed out without
 * letting them swallow the map when zoomed in.
 */
export const markerZoomFactor = (zoom: number): number => {
  if (zoom < 8) return Math.max(0.5, zoom / 16);
  if (zoom < 12) return 0.6 + ((zoom - 8) / 4) * 0.4; // 0.6 → 1.0
  return 1.0 + Math.min(0.4, (zoom - 12) / 10); // 1.0 → 1.4
};

/** Cheap planar distance in degrees; only ever used for proximity ranking. */
export const planarDistance = (
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number => Math.hypot(lat2 - lat1, lng2 - lng1);

/** Glassmorphic "N venues" bubble used when markers collapse at low zoom. */
export const createClusterMarkerElement = (
  count: number,
  isDarkTheme: boolean,
): HTMLDivElement => {
  const size = Math.min(64, 40 + Math.log2(count) * 8);
  const el = document.createElement("div");
  el.className = "venue-cluster-marker";
  el.setAttribute("role", "button");
  el.setAttribute("aria-label", `${count} venues — zoom in`);
  el.style.cssText = `
    width: ${size}px;
    height: ${size}px;
    display: grid;
    place-items: center;
    border-radius: 9999px;
    cursor: pointer;
    color: ${isDarkTheme ? "#F5F5F5" : "#141414"};
    font-weight: 700;
    font-size: ${Math.max(12, size * 0.3)}px;
    background: ${isDarkTheme ? "rgba(20,20,20,0.62)" : "rgba(255,255,255,0.72)"};
    border: 1.5px solid rgba(201,169,97,0.65);
    box-shadow: 0 6px 18px rgba(0,0,0,0.35);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    opacity: 0;
    animation: markerFadeIn 0.35s ease-out forwards;
  `;
  el.textContent = count > 99 ? "99+" : String(count);
  return el;
};
