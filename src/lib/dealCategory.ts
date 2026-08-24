/**
 * Deal → category resolution.
 *
 * Merchant self-serve deals only carry a coarse `deal_type` ("offer",
 * "event", "special"), which says what KIND of promotion it is, not what kind
 * of venue it belongs to. The old Personalized filter compared `deal_type`
 * against the profile preference buckets (Food / Drinks / Nightlife / Events)
 * and therefore never matched anything.
 *
 * We resolve the venue taxonomy from the merchant-supplied text (deal type,
 * title, description, venue name) using the same taxonomy the map markers,
 * search chips and JetCards use, then fold that into the four preference
 * buckets used by onboarding/profile preferences.
 */
import {
  resolveVenueCategory,
  VENUE_CATEGORIES,
  type VenueCategoryDef,
} from "@/lib/venue-categories";

export type PreferenceBucket = "Food" | "Drinks" | "Nightlife" | "Events";

/** Taxonomy id → profile preference bucket. */
const CATEGORY_TO_BUCKET: Record<string, PreferenceBucket> = {
  food: "Food",
  coffee: "Drinks",
  bar: "Drinks",
  brewery: "Drinks",
  lounge: "Drinks",
  nightlife: "Nightlife",
  concerts: "Events",
  sports: "Events",
  events: "Events",
};

/** Generic promotion types that say nothing about the venue category. */
const GENERIC_DEAL_TYPES = /^(offer|special|deal|promo|promotion|discount)$/;

export interface DealLike {
  deal_type?: string | null;
  title?: string | null;
  description?: string | null;
  venue_name?: string | null;
  venue_category?: string | null;
}

/**
 * Best-effort taxonomy entry for a merchant deal. Explicit venue category
 * wins, then a meaningful deal_type, then the free text the merchant wrote.
 */
export const resolveDealCategory = (deal: DealLike): VenueCategoryDef => {
  if (deal.venue_category) {
    const explicit = VENUE_CATEGORIES.find((def) =>
      def.match.test(deal.venue_category!.toLowerCase()),
    );
    if (explicit) return explicit;
  }

  const dealType = (deal.deal_type || "").toLowerCase().trim();
  if (dealType && !GENERIC_DEAL_TYPES.test(dealType)) {
    const byType = VENUE_CATEGORIES.find((def) => def.match.test(dealType));
    if (byType) return byType;
  }

  const text = [deal.title, deal.description, deal.venue_name]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const byText = VENUE_CATEGORIES.find((def) => def.match.test(text));
  if (byText) return byText;

  // "event" deal_type with no other signal still belongs in Events.
  if (dealType === "event") {
    return VENUE_CATEGORIES.find((d) => d.id === "events") ?? resolveVenueCategory(null);
  }

  return resolveVenueCategory(null);
};

/** Which profile preference bucket this deal belongs to. */
export const resolveDealPreferenceBucket = (deal: DealLike): PreferenceBucket =>
  CATEGORY_TO_BUCKET[resolveDealCategory(deal).id] ?? "Food";

/**
 * Does this deal match any of the user's selected preference categories?
 * Unknown/empty selections match everything so the filter never blanks out.
 */
export const dealMatchesPreferences = (
  deal: DealLike,
  categories: string[] | null | undefined,
): boolean => {
  if (!categories || categories.length === 0) return true;
  const bucket = resolveDealPreferenceBucket(deal).toLowerCase();
  return categories.some((c) => c.trim().toLowerCase() === bucket);
};
