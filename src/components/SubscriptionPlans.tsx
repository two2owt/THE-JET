import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Loader2, Zap, Crown, Sparkles } from "lucide-react";
import { useSubscription, SUBSCRIPTION_TIERS, SubscriptionTier } from "@/hooks/useSubscription";
import { toast } from "sonner";

const tierIcons: Record<SubscriptionTier, React.ReactNode> = {
  free: <Zap className="w-6 h-6" />,
  jet_plus: <Sparkles className="w-6 h-6" />,
  jetx: <Crown className="w-6 h-6" />,
};

export const SubscriptionPlans = () => {
  const { tier: currentTier, createCheckout, openCustomerPortal, isSubscribed, loading } = useSubscription();
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  const handleSubscribe = async (tierKey: SubscriptionTier) => {
    const tierInfo = SUBSCRIPTION_TIERS[tierKey];
    if (!tierInfo.priceId) return;

    setCheckoutLoading(tierKey);
    try {
      await createCheckout(tierInfo.priceId);
      toast.success("Redirecting to checkout...");
    } catch (error) {
      toast.error("Failed to start checkout", {
        description: "Please try again or contact support.",
      });
    } finally {
      setCheckoutLoading(null);
    }
  };

  const handleManageSubscription = async () => {
    setPortalLoading(true);
    try {
      await openCustomerPortal();
      toast.success("Opening subscription management...");
    } catch (error) {
      toast.error("Failed to open portal", {
        description: "Please try again or contact support.",
      });
    } finally {
      setPortalLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        {(Object.keys(SUBSCRIPTION_TIERS) as SubscriptionTier[]).map((tierKey) => {
          const tier = SUBSCRIPTION_TIERS[tierKey];
          const isCurrentTier = currentTier === tierKey;
          const isUpgrade = tierKey !== "free" && 
            (currentTier === "free" || (currentTier === "jet_plus" && tierKey === "jetx"));

          return (
            <Card
              key={tierKey}
              className={`relative transition-all bg-card/90 backdrop-blur-sm shadow-card ${
                isCurrentTier
                  ? "border-primary ring-2 ring-primary/20"
                  : "border-border/60 hover:border-primary/50 hover:shadow-glow"
              }`}
            >
              {isCurrentTier && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary">
                  Current Plan
                </Badge>
              )}
              
              <CardHeader className="text-center pb-2">
                <div className={`mx-auto mb-3 w-12 h-12 rounded-full flex items-center justify-center ${
                  tierKey === "free" ? "bg-muted text-muted-foreground" :
                  tierKey === "jet_plus" ? "bg-primary/20 text-primary" :
                  "bg-gradient-primary text-primary-foreground"
                }`}>
                  {tierIcons[tierKey]}
                </div>
                <CardTitle className="text-xl">{tier.name}</CardTitle>
                <CardDescription>
                  {tier.price === 0 ? (
                    <span className="text-2xl font-bold text-foreground">Free</span>
                  ) : (
                    <>
                      <span className="text-2xl font-bold text-foreground">${tier.price}</span>
                      <span className="text-muted-foreground">/month</span>
                    </>
                  )}
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-3">
                {tier.features.map((feature, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                    <span className="text-sm text-muted-foreground">{feature}</span>
                  </div>
                ))}
              </CardContent>

              <CardFooter>
                {isCurrentTier ? (
                  isSubscribed ? (
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={handleManageSubscription}
                      disabled={portalLoading}
                    >
                      {portalLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : null}
                      Manage Subscription
                    </Button>
                  ) : (
                    <Button variant="outline" className="w-full" disabled>
                      Current Plan
                    </Button>
                  )
                ) : tierKey === "free" ? (
                  <Button variant="ghost" className="w-full" disabled>
                    Free Forever
                  </Button>
                ) : (
                  <Button
                    className={`w-full ${
                      tierKey === "jetx" ? "bg-gradient-primary hover:opacity-90" : ""
                    }`}
                    onClick={() => handleSubscribe(tierKey)}
                    disabled={checkoutLoading !== null}
                  >
                    {checkoutLoading === tierKey ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : null}
                    {isUpgrade ? "Upgrade" : "Subscribe"}
                  </Button>
                )}
              </CardFooter>
            </Card>
          );
        })}
      </div>

      {isSubscribed && (
        <div className="text-center">
          <Button variant="link" onClick={handleManageSubscription} disabled={portalLoading}>
            {portalLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Manage billing, cancel, or change plan
          </Button>
        </div>
      )}
    </div>
  );
};
