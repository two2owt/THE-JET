import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import {
  useSubscription,
  SUBSCRIPTION_TIERS,
  SubscriptionTier,
} from "@/hooks/useSubscription";
import { canPurchaseSubscription } from "@/lib/platform";
import { rememberPostAuthRedirect } from "@/lib/postAuthRedirect";
import { ANALYTICS_EVENTS } from "@/lib/analyticsEvents";

/**
 * Where Stripe sends the user back to. Kept as a real, existing route —
 * the account tab of /profile renders <SubscriptionPlans />, so the user
 * lands on the exact surface that reflects their new tier.
 */
export const CHECKOUT_RETURN_PATH = "/profile?tab=account";

/** Query param used to resume an upgrade after a sign-in detour. */
export const UPGRADE_PARAM = "upgrade";

const track = async (event: string, props: Record<string, unknown>) => {
  try {
    const { analytics } = await import("@/lib/analytics");
    analytics.track(event, props);
  } catch {
    /* analytics must never break checkout */
  }
};

/**
 * Single entry point for every paywall / CTA that sells a tier.
 *
 * Handles the whole seam between "user taps Upgrade" and "user is on Stripe":
 * platform eligibility, sign-in detour with resume, analytics, per-tier
 * loading state, opening the session without being eaten by popup blockers,
 * and human-readable failures.
 */
export const useUpgradeFlow = () => {
  const { createCheckout, tier: currentTier } = useSubscription();
  const navigate = useNavigate();
  const [pendingTier, setPendingTier] = useState<SubscriptionTier | null>(null);
  const canPurchase = canPurchaseSubscription();

  const startUpgrade = useCallback(
    async (tier: SubscriptionTier, source: string) => {
      const tierInfo = SUBSCRIPTION_TIERS[tier];
      if (!tierInfo.priceId) return;

      if (!canPurchase) {
        toast.info("Subscriptions are managed on the web", {
          description: "Open jet-around.com to upgrade your plan.",
        });
        return;
      }

      setPendingTier(tier);
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        // Not signed in: remember the intent and resume checkout automatically
        // once auth completes, instead of dead-ending on the paywall.
        if (!session) {
          const resumeTo = `${CHECKOUT_RETURN_PATH}&${UPGRADE_PARAM}=${tier}`;
          rememberPostAuthRedirect(resumeTo);
          void track(ANALYTICS_EVENTS.BEGIN_CHECKOUT, {
            tier,
            source,
            requires_auth: true,
          });
          toast.info("Sign in to continue", {
            description: `We'll take you straight to ${tierInfo.name} checkout.`,
          });
          navigate("/signin");
          return;
        }

        void track(ANALYTICS_EVENTS.BEGIN_CHECKOUT, {
          tier,
          source,
          price_id: tierInfo.priceId,
          current_tier: currentTier,
        });

        await createCheckout(tierInfo.priceId, {
          tier,
          returnPath: CHECKOUT_RETURN_PATH,
        });
      } catch (err) {
        console.error("Upgrade flow failed:", err);
        void track(ANALYTICS_EVENTS.CHECKOUT_FAILED, { tier, source });
        toast.error("Couldn't start checkout", {
          description: "Please try again or contact support.",
        });
      } finally {
        setPendingTier(null);
      }
    },
    [canPurchase, createCheckout, currentTier, navigate],
  );

  return {
    startUpgrade,
    /** Tier currently being sent to Stripe, or null. */
    pendingTier,
    isStarting: pendingTier !== null,
    canPurchase,
    currentTier,
  };
};
