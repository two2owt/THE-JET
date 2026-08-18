/**
 * Mapbox GL JS `Map#setScaleFactor` helpers (available since v3.19).
 *
 * The scale factor multiplies the rendered size of every symbol layer's text
 * and icons without touching the style itself. On phones the default Mapbox
 * label sizes are tuned for desktop reading distance, so street/POI labels and
 * our venue glyphs end up noticeably harder to read. We scale them up on small
 * viewports and leave desktop untouched.
 */

const MIN_SCALE = 1;
const MAX_SCALE = 1.6;

export function clampScaleFactor(value: number): number {
  if (!Number.isFinite(value)) return MIN_SCALE;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(value * 100) / 100));
}

/**
 * Resolve the scale factor for the current viewport.
 * Falls back to 1 during SSR (no `window`).
 */
export function getMapScaleFactor(): number {
  if (typeof window === "undefined") return MIN_SCALE;

  const width = window.innerWidth || 1024;
  const coarsePointer =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches;

  let scale: number;
  if (width < 400) {
    // Small phones — biggest readability win.
    scale = 1.3;
  } else if (width < 768) {
    scale = 1.2;
  } else if (width < 1024) {
    // Tablets: a small bump only when it's a touch device held closer.
    scale = coarsePointer ? 1.1 : 1;
  } else {
    scale = 1;
  }

  // Respect the OS/browser text-size preference when it's been increased.
  try {
    const rootFontSize = parseFloat(
      window.getComputedStyle(document.documentElement).fontSize,
    );
    if (Number.isFinite(rootFontSize) && rootFontSize > 16) {
      scale *= Math.min(1.25, rootFontSize / 16);
    }
  } catch {
    /* ignore — computed style is unavailable in some embedded webviews */
  }

  return clampScaleFactor(scale);
}

type ScalableMap = {
  setScaleFactor?: (factor: number) => void;
  getScaleFactor?: () => number;
};

/**
 * Apply the viewport-appropriate scale factor to a map instance.
 * No-ops safely on older Mapbox builds that predate `setScaleFactor`.
 * Returns the applied factor, or `null` when nothing was applied.
 */
export function applyMapScaleFactor(
  map: unknown,
  factor: number = getMapScaleFactor(),
): number | null {
  const target = map as ScalableMap | null | undefined;
  if (!target || typeof target.setScaleFactor !== "function") return null;

  try {
    const current =
      typeof target.getScaleFactor === "function"
        ? target.getScaleFactor()
        : undefined;
    const next = clampScaleFactor(factor);
    if (typeof current === "number" && Math.abs(current - next) < 0.01) {
      return current;
    }
    target.setScaleFactor(next);
    return next;
  } catch {
    return null;
  }
}