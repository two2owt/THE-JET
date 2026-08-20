import { useState } from "react";
import { Check, Loader2, Share2 } from "lucide-react";
import { toast } from "sonner";
import { getDealDeepLink, getVenueDeepLink } from "@/utils/shareUtils";
import {
  trackDeepLinkShared,
  type DeepLinkKind,
  type DeepLinkSurface,
} from "@/lib/deepLinkAnalytics";
import { cn } from "@/lib/utils";

interface ShareDeepLinkButtonProps {
  kind: DeepLinkKind;
  /** Stable id (venue id or deal id) — never a display name. */
  targetId: string;
  label?: string | null;
  /** Signed-in user id, used for ?ref= share attribution. */
  referrerId?: string | null;
  surface?: DeepLinkSurface;
  className?: string;
}

/**
 * Copies (or natively shares) a stable JetCard deep link for a venue/deal.
 * The URL always uses ids, so the link restores the exact JetCard on a cold
 * load even if the venue is renamed or falls outside the loaded city set.
 */
export function ShareDeepLinkButton({
  kind,
  targetId,
  label,
  referrerId,
  surface = "favorites",
  className,
}: ShareDeepLinkButtonProps) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (busy || !targetId) return;
    setBusy(true);
    const url =
      kind === "venue"
        ? getVenueDeepLink(targetId, referrerId)
        : getDealDeepLink(targetId, referrerId);
    const title = label ?? (kind === "venue" ? "Venue on JET" : "Deal on JET");
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title, text: `${title} on JET`, url });
        trackDeepLinkShared(kind, targetId, surface, "native");
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      trackDeepLinkShared(kind, targetId, surface, "clipboard");
      toast.success("Link copied", { description: title });
    } catch (error) {
      if ((error as Error)?.name === "AbortError") return;
      trackDeepLinkShared(kind, targetId, surface, "failed");
      toast.error("Couldn't share that link", { description: url });
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleShare}
      disabled={busy}
      aria-label={`Share link to ${label ?? (kind === "venue" ? "this venue" : "this deal")}`}
      data-testid={`share-${kind}-${targetId}`}
      className={cn(
        "w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-background/60 backdrop-blur-md flex items-center justify-center text-foreground/80 hover:text-primary hover:bg-background/80 transition",
        className,
      )}
    >
      {busy ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : copied ? (
        <Check className="w-4 h-4 text-primary" />
      ) : (
        <Share2 className="w-4 h-4" />
      )}
    </button>
  );
}
