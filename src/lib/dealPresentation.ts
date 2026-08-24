/**
 * Single source of truth for how a merchant deal is presented.
 *
 * /deals cards, the JetCard deal detail, and the alert cards all previously
 * derived deal type, category and expiry independently (three copies of
 * `getTimeRemaining`, one hardcoded deal_type→category map). They now all read
 * from `getDealPresentation` so the same deal reads identically everywhere.
 */
import { resolveDealCategory, type DealLike } from "@/lib/dealCategory";
import { getDealExpiry, type DealExpiry } from "@/lib/dealExpiry";
import type { VenueCategoryDef } from "@/lib/venue-categories";

export interface DealPresentationInput extends DealLike {
  expires_at?: string | null;
}

export interface DealPresentation {
  /** Merchant promotion type, title-cased ("Offer", "Event", "Special"). */
  typeLabel: string | null;
  /** Raw merchant value, lowercased, for emoji/icon lookups. */
  typeId: string | null;
  /** Emoji used by the /deals list and JetCard headers. */
  typeEmoji: string;
  /** Venue taxonomy entry (label, Icon, accent colors) resolved from the deal. */
  category: VenueCategoryDef;
  /** Countdown / expired state, or null when the deal has no end date. */
  expiry: DealExpiry | null;
}

const TYPE_EMOJI: Record<string, string> = {
  offer: "🎉",
  event: "🎵",
  special: "⭐",
};

const titleCase = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();

export const getDealPresentation = (
  deal: DealPresentationInput,
  now: number = Date.now(),
): DealPresentation => {
  const typeId = deal.deal_type?.trim().toLowerCase() || null;
  return {
    typeId,
    typeLabel: typeId ? titleCase(typeId) : null,
    typeEmoji: (typeId && TYPE_EMOJI[typeId]) || "💎",
    category: resolveDealCategory(deal),
    expiry: getDealExpiry(deal.expires_at, now),
  };
};
