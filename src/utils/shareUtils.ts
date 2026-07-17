import { supabase } from "@/integrations/supabase/client";
import type { Venue } from "@/types/venue";

interface Deal {
  id: string;
  title: string;
  venue_name: string;
  description: string;
}

/**
 * Build a share URL with an optional referral attribution param so growth
 * analytics can credit the sharer for downstream sign-ups / opens.
 */
const withRef = (url: string, referrerId?: string | null) => {
  if (!referrerId) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}ref=${encodeURIComponent(referrerId)}`;
};

export const shareDeal = async (deal: Deal, userId: string | undefined) => {
  const shareUrl = withRef(`${window.location.origin}/?deal=${deal.id}`, userId);
  const shareText = `Check out this deal: ${deal.title} at ${deal.venue_name}`;

  // Track the share
  if (userId) {
    try {
      await supabase.from("deal_shares").insert({
        user_id: userId,
        deal_id: deal.id,
      });
    } catch (error) {
      console.error("Error tracking share:", error);
    }
  }

  // Use Web Share API if available
  if (navigator.share) {
    try {
      await navigator.share({
        title: deal.title,
        text: shareText,
        url: shareUrl,
      });
      return { success: true, method: "native" };
    } catch (error) {
      // User cancelled or share failed
      if ((error as Error).name !== "AbortError") {
        console.error("Error sharing:", error);
      }
      return { success: false, method: "native" };
    }
  } else {
    // Fallback: Copy to clipboard
    try {
      await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
      return { success: true, method: "clipboard" };
    } catch (error) {
      console.error("Error copying to clipboard:", error);
      return { success: false, method: "clipboard" };
    }
  }
};

export const shareVenue = async (
  venue: Pick<Venue, 'id' | 'name'>,
  referrerId?: string | null,
) => {
  const shareUrl = withRef(
    `${window.location.origin}/?venue=${encodeURIComponent(venue.id)}`,
    referrerId,
  );
  const shareText = `Check out ${venue.name} on JET!`;

  // Use Web Share API if available
  if (navigator.share) {
    try {
      await navigator.share({
        title: venue.name,
        text: shareText,
        url: shareUrl,
      });
      return { success: true, method: "native" };
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        console.error("Error sharing venue:", error);
      }
      return { success: false, method: "native" };
    }
  } else {
    try {
      await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
      return { success: true, method: "clipboard" };
    } catch (error) {
      console.error("Error copying to clipboard:", error);
      return { success: false, method: "clipboard" };
    }
  }
};

// Generate a deep link URL for a deal. Optional referrerId attributes the
// share to a specific user so ?ref= can be tracked in analytics.
export const getDealDeepLink = (dealId: string, referrerId?: string | null) => {
  return withRef(`${window.location.origin}/?deal=${dealId}`, referrerId);
};

// Generate a deep link URL for a venue. Uses the stable venue id so links
// keep resolving even if the venue's display name changes.
export const getVenueDeepLink = (
  venueId: string,
  referrerId?: string | null,
) => {
  return withRef(
    `${window.location.origin}/?venue=${encodeURIComponent(venueId)}`,
    referrerId,
  );
};
