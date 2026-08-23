import type { LucideIcon } from "lucide-react";
import { resolveVenueCategory } from "@/lib/venue-categories";

/**
 * Maps a venue/deal category to the same iconology + accent hues used by the
 * map markers, so search placeholders read consistently with the map.
 *
 * Thin wrapper over the shared taxonomy in `venue-categories.ts` — kept so
 * existing call sites don't need to know about the fuller definition.
 */
export const categoryIconFor = (
  category?: string | null,
): { Icon: LucideIcon; accent: string; label: string } => {
  const def = resolveVenueCategory(category);
  return { Icon: def.Icon, accent: def.dark, label: def.label };
};
