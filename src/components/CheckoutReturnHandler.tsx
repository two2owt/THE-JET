import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useSearchParams } from "@/lib/router-compat";
import { useSubscription, SubscriptionTier } from "@/hooks/useSubscription";
import { useUpgradeFlow, UPGRADE_PARAM } from "@/hooks/useUpgradeFlow";

const VALID_TIERS: SubscriptionTier[] = ["jet_plus", "jetx"];

/**
 * Closes the loop on the upgrade flow.
 *
 * 1. `?upgrade=<tier>` — a checkout intent that survived a sign-in detour;
 *    resume it as soon as the user is back with a session.
 * 2. `?checkout=success` — returned from Stripe: reconcile against Stripe once
 *    (the webhook may be a beat behind) and confirm the unlock.
 * 3. `?checkout=canceled` — acknowledge without guilt-tripping.
 *
 * Params are stripped afterwards so a refresh never re-fires the flow.
 */
export const CheckoutReturnHandler = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { syncWithStripe } = useSubscription();
  const { startUpgrade } = useUpgradeFlow();
  const handled = useRef<string | null>(null);

  const checkout = searchParams.get("checkout");
  const upgrade = searchParams.get(UPGRADE_PARAM);

  useEffect(() => {
    if (!checkout && !upgrade) return;
    const key = `${checkout ?? ""}|${upgrade ?? ""}`;
    if (handled.current === key) return;
    handled.current = key;

    const next = new URLSearchParams(searchParams);
    next.delete("checkout");
    next.delete(UPGRADE_PARAM);
    next.delete("tier");
    setSearchParams(next, { replace: true });

    if (checkout === "success") {
      toast.success("Payment received", {
        description: "Unlocking your new plan…",
      });
      void syncWithStripe();
      return;
    }

    if (checkout === "canceled") {
      toast.info("Checkout canceled", {
        description: "Your plan is unchanged — upgrade any time.",
      });
      return;
    }

    if (upgrade && VALID_TIERS.includes(upgrade as SubscriptionTier)) {
      void startUpgrade(upgrade as SubscriptionTier, "resume_after_auth");
    }
  }, [checkout, upgrade, searchParams, setSearchParams, syncWithStripe, startUpgrade]);

  return null;
};
