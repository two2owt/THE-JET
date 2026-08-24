/**
 * Venue activity palette.
 *
 * The hue of each tier is fixed so the legend reads identically on every
 * basemap; only lightness/saturation swap between light and dark basemaps so
 * the marker keeps usable contrast on light-v11, dark-v11, streets and
 * satellite alike. Pair the fill with `casingFor()` — the casing is what makes
 * the marker legible over high-local-contrast imagery (satellite in
 * particular), where no single fill value survives on its own.
 *
 * Hue choices:
 *  - Peak uses rose-red (352) rather than pure red so it separates from the
 *    amber tier under deuteranopia/protanopia.
 *  - Busy uses amber (28) rather than yellow (45). Yellow has the highest
 *    intrinsic luminance of any hue and cannot be made legible on a white
 *    basemap without darkening past the point where it still reads as "warm".
 */

export type ActivityTierId = "peak" | "busy" | "steady" | "quiet";

export interface ActivityTier {
  id: ActivityTierId;
  /** Inclusive lower bound of the 0-100 activity score for this tier. */
  min: number;
  /** Short legend label. */
  label: string;
  /** Fill on a light basemap (light-v11 / streets-v12). */
  light: string;
  /** Fill on a dark basemap (dark-v11 / satellite-streets-v12). */
  dark: string;
}

/** Ordered high -> low so `find` returns the first matching tier. */
export const ACTIVITY_TIERS: readonly ActivityTier[] = [
  { id: "peak", min: 80, label: "Peak", light: "#C4123F", dark: "#FF5C7A" },
  { id: "busy", min: 60, label: "Busy", light: "#B45309", dark: "#FFAE4D" },
  { id: "steady", min: 35, label: "Steady", light: "#0F6E63", dark: "#4FD8C4" },
  { id: "quiet", min: 0, label: "Quiet", light: "#3A5A8C", dark: "#8FB4E8" },
] as const;

/** The tier an activity score falls into. Scores are clamped to 0-100. */
export function activityTier(activity: number): ActivityTier {
  const score = Number.isFinite(activity)
    ? Math.min(100, Math.max(0, activity))
    : 0;
  return (
    ACTIVITY_TIERS.find((tier) => score >= tier.min) ??
    ACTIVITY_TIERS[ACTIVITY_TIERS.length - 1]
  );
}

/** Tier fill colour for the current basemap. */
export function activityColor(
  activity: number,
  isLightBasemap: boolean,
): string {
  const tier = activityTier(activity);
  return isLightBasemap ? tier.light : tier.dark;
}

/**
 * Contrast casing drawn *outside* the marker fill. Dark casing on light
 * basemaps, light casing on dark ones — this is the layer that keeps a marker
 * readable over satellite imagery where the pixels underneath are arbitrary.
 */
export function casingFor(isLightBasemap: boolean): string {
  return isLightBasemap ? "rgba(10, 10, 10, 0.55)" : "rgba(255, 255, 255, 0.5)";
}

/**
 * Legend swatches, ordered high -> low.
 *
 * The legend renders inside the app's own dark glass panel, never directly on
 * the basemap, so its swatches deliberately do NOT follow the basemap. They
 * always use the dark-surface fills, which keeps the legend marks identical
 * across light, dark, auto, streets and satellite styles.
 */
export function activityLegendTiers(): Array<{
  id: ActivityTierId;
  label: string;
  color: string;
}> {
  return ACTIVITY_TIERS.map((tier) => ({
    id: tier.id,
    label: tier.label,
    color: tier.dark,
  }));
}

/**
 * Shared swatch styling for legend marks. A fixed casing ring + soft glow so
 * the dot reads the same way in the collapsed pill and the expanded legend, on
 * any map style. The swatch is sized for a comfortable tap/click target while
 * the casing ring stays subtle and consistent regardless of basemap.
 */
export function legendSwatchStyle(color: string, size = 18) {
  return {
    width: `${size}px`,
    height: `${size}px`,
    flexShrink: 0,
    borderRadius: "50%",
    background: color,
    // Subtle light casing ring that pops against the dark glass legend panel
    // and stays identical on light, dark, auto, streets, and satellite basemaps.
    border: "2px solid rgba(255, 255, 255, 0.28)",
    boxSizing: "border-box",
    boxShadow: `0 0 0 1px rgba(0, 0, 0, 0.25), 0 0 5px ${color}, 0 0 11px ${color}80`,
  } as const;
}
