import { supabase } from "@/integrations/supabase/client";
import { getAppUrl } from "@/lib/utils";
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
/**
 * Shared links must always point at the public site, never at whatever
 * preview / localhost / lovable.app origin the sharer happens to be on —
 * otherwise recipients hit a login wall or an ephemeral URL that expires.
 */
const shareOrigin = () => {
  const base = getAppUrl();
  // getAppUrl() keeps you on an allowed lovable.app/preview host when that's
  // where you are; for shares we force the public custom domain.
  return base.includes("jet-around.com") ? base : "https://jet-around.com";
};

const withRef = (url: string, referrerId?: string | null) => {
  if (!referrerId) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}ref=${encodeURIComponent(referrerId)}`;
};

/**
 * Copy text to the clipboard across browsers. The async Clipboard API is
 * missing on older Safari/Firefox and on non-secure origins, so fall back to
 * a hidden textarea + execCommand which every evergreen browser still honours.
 */
export const copyTextToClipboard = async (text: string): Promise<boolean> => {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to the legacy path below
    }
  }

  if (typeof document === "undefined") return false;

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "-1000px";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
};

export const shareDeal = async (deal: Deal, userId: string | undefined) => {
  const shareUrl = withRef(
    `${shareOrigin()}/?deal=${deal.id}`,
    userId,
  );
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
    const copied = await copyTextToClipboard(`${shareText}\n${shareUrl}`);
    return { success: copied, method: "clipboard" };
  }
};

export const shareVenue = async (
  venue: Pick<Venue, "id" | "name">,
  referrerId?: string | null,
) => {
  const shareUrl = withRef(
    `${shareOrigin()}/?venue=${encodeURIComponent(venue.id)}`,
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
    const copied = await copyTextToClipboard(`${shareText}\n${shareUrl}`);
    return { success: copied, method: "clipboard" };
  }
};

// Generate a deep link URL for a deal. Optional referrerId attributes the
// share to a specific user so ?ref= can be tracked in analytics.
export const getDealDeepLink = (dealId: string, referrerId?: string | null) => {
  return withRef(`${shareOrigin()}/?deal=${dealId}`, referrerId);
};

// Generate a deep link URL for a venue. Uses the stable venue id so links
// keep resolving even if the venue's display name changes.
export const getVenueDeepLink = (
  venueId: string,
  referrerId?: string | null,
) => {
  return withRef(
    `${shareOrigin()}/?venue=${encodeURIComponent(venueId)}`,
    referrerId,
  );
};
