import { Crown, Sparkles } from "lucide-react";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { useSubscription, SubscriptionTier, SUBSCRIPTION_TIERS } from "@/hooks/useSubscription";
import { useState } from "react";

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
  const { createCheckout } = useSubscription();
  const [loading, setLoading] = useState(false);
  const tierInfo = SUBSCRIPTION_TIERS[requiredTier];

  const handleUpgrade = async () => {
    if (!tierInfo.priceId) return;
    
    setLoading(true);
    try {
      await createCheckout(tierInfo.priceId);
      onClose();
    } catch (error) {
      console.error("Error creating checkout:", error);
    } finally {
      setLoading(false);
    }
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
                <li key={index} className="flex items-center gap-2 text-sm text-muted-foreground">
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
              Maybe Later
            </Button>
            <Button
              onClick={handleUpgrade}
              variant="jet"
              className="flex-1"
              disabled={loading}
            >
              {loading ? "Loading..." : "Upgrade Now"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Import from lightweight utility module (avoids pulling in admin UI components)
import { isMonetizationEnabled } from "@/lib/monetization";

// Hook to check feature access
export const useFeatureAccess = () => {
  const { tier, loading } = useSubscription();

  const canAccessFeature = (requiredTier: SubscriptionTier): boolean => {
    // Check monetization status (includes admin override and release date)
    if (!isMonetizationEnabled()) return true;
    
    if (loading) return false;
    
    const tierOrder: Record<SubscriptionTier, number> = {
      free: 0,
      jet_plus: 1,
      jetx: 2,
    };

    return tierOrder[tier] >= tierOrder[requiredTier];
  };

  const canAccessSocialFeatures = () => canAccessFeature("jet_plus");
  const canAccessVIPFeatures = () => canAccessFeature("jetx");

  return {
    tier,
    loading,
    isMonetizationActive: isMonetizationEnabled(),
    canAccessFeature,
    canAccessSocialFeatures,
    canAccessVIPFeatures,
  };
};
