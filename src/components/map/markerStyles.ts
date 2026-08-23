/**
 * Pure presentation helpers for venue markers.
 *
 * These were previously inline closures inside `MapboxHeatmap.updateMarkers`,
 * re-created on every marker pass. They depend on nothing but their arguments,
 * so they live here: cheaper, testable, and the marker pass stays readable.
 */

export type FloralPalette = { light: string; dark: string };

/**
 * Category → botanical hue, with a light-basemap and dark-basemap variant so
 * glyphs stay legible on either style.
 */
export const getCategoryFloral = (category: string): FloralPalette => {
  const c = (category || "").toLowerCase();
  if (/(bar|cocktail|lounge|pub|brew|beer|wine|spirits)/.test(c))
    return { light: "#7C4DBE", dark: "#C6A0F5" }; // wisteria
  if (/(coffee|cafe|tea|bakery|dessert)/.test(c))
    return { light: "#B4682E", dark: "#F0B27A" }; // marigold / calendula
  if (/(music|concert|live|venue|night|club|dj)/.test(c))
    return { light: "#A8286B", dark: "#F58BC0" }; // orchid
  if (/(event|festival|theater|theatre|show|comedy)/.test(c))
    return { light: "#B8860B", dark: "#F5D06F" }; // sunflower
  if (/(gym|fitness|yoga|sport|run|spa)/.test(c))
    return { light: "#2E7D6B", dark: "#7FDCC2" }; // fern / eucalyptus
  if (/(shop|retail|store|market|boutique)/.test(c))
    return { light: "#1E6FA8", dark: "#7FC4F2" }; // hydrangea
  if (/(hotel|stay|lodging|resort)/.test(c))
    return { light: "#6B5BA8", dark: "#B3AAF0" }; // lavender
  return { light: "#C13B5A", dark: "#FF8FA3" }; // camellia / rose (food default)
};

/** Category → Lucide SVG path d-strings (24x24 viewBox). */
export const getCategoryIcon = (category: string): string => {
  const c = (category || "").toLowerCase();
  if (/(bar|cocktail|lounge|pub|brew|beer|wine|spirits)/.test(c))
    return '<path d="M8 22h8"/><path d="M12 11v11"/><path d="M19 3H5l7 8z"/>';
  if (/(coffee|cafe|tea|bakery|dessert)/.test(c))
    return '<path d="M17 8h1a4 4 0 0 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z"/><line x1="6" y1="2" x2="6" y2="4"/><line x1="10" y1="2" x2="10" y2="4"/><line x1="14" y1="2" x2="14" y2="4"/>';
  if (/(music|concert|live|venue|night|club|dj)/.test(c))
    return '<circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/><path d="M9 18V5l12-2v13"/>';
  if (/(event|festival|theater|theatre|show|comedy)/.test(c))
    return '<path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/>';
  if (/(gym|fitness|yoga|sport|run|spa)/.test(c))
    return '<path d="M6.5 6.5 17.5 17.5"/><path d="m21 21-1-1"/><path d="m3 3 1 1"/><path d="m18 22 4-4"/><path d="m2 6 4-4"/><path d="m3 10 7-7"/><path d="m14 21 7-7"/>';
  if (/(shop|retail|store|market|boutique)/.test(c))
    return '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>';
  if (/(hotel|stay|lodging|resort)/.test(c))
    return '<path d="M2 22V8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v14"/><path d="M2 18h20"/><circle cx="8" cy="12" r="2"/>';
  // default: utensils (food / restaurant)
  return '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>';
};

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
