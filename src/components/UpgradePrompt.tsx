import { Crown, Sparkles } from "lucide-react";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import {
  useSubscription,
  SubscriptionTier,
  SUBSCRIPTION_TIERS,
} from "@/hooks/useSubscription";
import { useUpgradeFlow } from "@/hooks/useUpgradeFlow";

interface UpgradePromptProps {
  requiredTier: SubscriptionTier;
  featureName: string;
  isOpen: boolean;
  onClose: () => void;
}

export const UpgradePrompt = ({
  requiredTier,
  featureName,
  isOpen,
  onClose,
}: UpgradePromptProps) => {
  const { startUpgrade, pendingTier, canPurchase } = useUpgradeFlow();
  const loading = pendingTier === requiredTier;
  const tierInfo = SUBSCRIPTION_TIERS[requiredTier];

  const handleUpgrade = async () => {
    if (!tierInfo.priceId) return;
    await startUpgrade(requiredTier, `paywall:${featureName}`);
    onClose();
  };


  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <div className="flex items-center justify-center w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-primary/20 to-accent/20">
            {requiredTier === "jetx" ? (
              <Sparkles className="w-8 h-8 text-primary" />
            ) : (
              <Crown className="w-8 h-8 text-primary" />
            )}
          </div>
          <DialogTitle className="text-center text-xl">
            Upgrade to {tierInfo.name}
          </DialogTitle>
          <DialogDescription className="text-center">
            {featureName} is a premium feature available with {tierInfo.name}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="bg-muted/50 rounded-xl p-4 space-y-2">
            <p className="font-semibold text-foreground text-center">
              ${tierInfo.price}/month
            </p>
            <ul className="space-y-2">
              {tierInfo.features.map((feature, index) => (
                <li
                  key={index}
                  className="flex items-center gap-2 text-sm text-muted-foreground"
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                  {feature}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={onClose}
              className="flex-1"
              disabled={loading}
            >
              {canPurchase ? "Maybe Later" : "Close"}
            </Button>
            {canPurchase ? (
              <Button
                onClick={handleUpgrade}
                variant="jet"
                className="flex-1"
                disabled={loading}
              >
                {loading ? "Loading..." : "Upgrade Now"}
              </Button>
            ) : (
              <Button variant="jet" className="flex-1" disabled>
                Available on web
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Reactive global monetization flag (server-owned, live over Realtime).
import { useMonetization } from "@/hooks/useMonetization";
import { useVerifiedTier } from "@/hooks/useVerifiedTier";

const TIER_ORDER: Record<SubscriptionTier, number> = {
  free: 0,
  jet_plus: 1,
  jetx: 2,
};

/**
 * Feature gating.
 *
 * The UI answer is only a hint: the effective tier is re-derived server-side
 * (`public.effective_subscription_tier`) and the gated write surfaces
 * (connections, deal shares, venue reviews) additionally enforce
 * `public.has_feature_access('jet_plus')` inside their RLS policies. Tampering
 * with client state therefore cannot unlock a paid capability.
 */
export const useFeatureAccess = () => {
  const { tier: clientTier, loading } = useSubscription();
  const { enabled: monetizationActive } = useMonetization();
  const { verifiedTier, verifying } = useVerifiedTier();

  // Take the stricter of the two answers until the server has confirmed.
  const effectiveTier: SubscriptionTier =
    verifiedTier === null
      ? "free"
      : TIER_ORDER[verifiedTier] <= TIER_ORDER[clientTier]
        ? verifiedTier
        : clientTier;

  const canAccessFeature = (requiredTier: SubscriptionTier): boolean => {
    // Monetization off = everything unlocked (matches the server function).
    if (!monetizationActive) return true;

    if (loading || verifying) return false;

    return TIER_ORDER[effectiveTier] >= TIER_ORDER[requiredTier];
  };

  const canAccessSocialFeatures = () => canAccessFeature("jet_plus");
  const canAccessVIPFeatures = () => canAccessFeature("jetx");

  return {
    tier: effectiveTier,
    loading: loading || verifying,
    isMonetizationActive: monetizationActive,
    canAccessFeature,
    canAccessSocialFeatures,
    canAccessVIPFeatures,
  };
};

