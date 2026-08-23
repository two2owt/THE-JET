import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Loader2, Zap, Crown, Sparkles } from "lucide-react";
import {
  useSubscription,
  SUBSCRIPTION_TIERS,
  SubscriptionTier,
} from "@/hooks/useSubscription";
import { useUpgradeFlow } from "@/hooks/useUpgradeFlow";
import { toast } from "sonner";

const tierIcons: Record<SubscriptionTier, React.ReactNode> = {
  free: <Zap className="w-6 h-6" />,
  jet_plus: <Sparkles className="w-6 h-6" />,
  jetx: <Crown className="w-6 h-6" />,
};

export const SubscriptionPlans = () => {
  const {
    tier: currentTier,
    openCustomerPortal,
    isSubscribed,
    loading,
  } = useSubscription();
  const { startUpgrade, pendingTier, canPurchase } = useUpgradeFlow();
  const [portalLoading, setPortalLoading] = useState(false);
  const checkoutLoading = pendingTier;

  const handleSubscribe = (tierKey: SubscriptionTier) =>
    startUpgrade(tierKey, "plans_grid");


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
    // Skeleton mirrors the final 3-card grid so the card doesn't jump height.
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Loading plans">
        <div className="grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="rounded-xl border-hairline bg-card/40 p-5 animate-pulse flex flex-col gap-4 min-h-[280px]"
            >
              <div className="h-10 w-10 rounded-full bg-muted/40" />
              <div className="h-5 w-24 rounded bg-muted/40" />
              <div className="h-3 w-32 rounded bg-muted/30" />
              <div className="flex-1 space-y-2 pt-2">
                <div className="h-3 w-full rounded bg-muted/25" />
                <div className="h-3 w-5/6 rounded bg-muted/25" />
                <div className="h-3 w-4/6 rounded bg-muted/25" />
              </div>
              <div className="h-10 w-full rounded-full bg-muted/30" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const tierTaglines: Record<SubscriptionTier, string> = {
    free: "Discover what's happening near you",
    jet_plus: "Connect and share with your crew",
    jetx: "VIP access to exclusive experiences",
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h3 className="text-lg font-semibold tracking-tight">
          Choose your JET experience
        </h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Start free, unlock social features with JET+, or go VIP with JETx for
          exclusive deals and priority access.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {(Object.keys(SUBSCRIPTION_TIERS) as SubscriptionTier[]).map(
          (tierKey) => {
            const tier = SUBSCRIPTION_TIERS[tierKey];
            const isCurrentTier = currentTier === tierKey;
            const isUpgrade =
              tierKey !== "free" &&
              (currentTier === "free" ||
                (currentTier === "jet_plus" && tierKey === "jetx"));

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
                  <div
                    className={`mx-auto mb-3 w-12 h-12 rounded-full flex items-center justify-center ${
                      tierKey === "free"
                        ? "bg-muted text-muted-foreground"
                        : tierKey === "jet_plus"
                          ? "bg-primary/20 text-primary"
                          : "bg-gradient-primary text-primary-foreground"
                    }`}
                  >
                    {tierIcons[tierKey]}
                  </div>
                  <CardTitle className="text-xl">{tier.name}</CardTitle>
                  <p className="text-xs text-primary font-medium mt-1">
                    {tierTaglines[tierKey]}
                  </p>
                  <CardDescription className="pt-2">
                    {tier.price === 0 ? (
                      <span className="text-2xl font-bold text-foreground">
                        Free
                      </span>
                    ) : (
                      <>
                        <span className="text-2xl font-bold text-foreground">
                          ${tier.price}
                        </span>
                        <span className="text-muted-foreground">/month</span>
                      </>
                    )}
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-3">
                  {tier.features.map((feature, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                      <span className="text-sm text-muted-foreground">
                        {feature}
                      </span>
                    </div>
                  ))}
                </CardContent>

                <CardFooter>
                  {isCurrentTier ? (
                    isSubscribed ? (
                      <Button
                        variant="outline"
                        className="w-full rounded-full border-primary/40 bg-transparent text-foreground hover:border-primary/70 hover:bg-primary/10 hover:text-primary"
                        onClick={handleManageSubscription}
                        disabled={portalLoading}
                      >
                        {portalLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        ) : null}
                        Manage Subscription
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        className="w-full rounded-full"
                        disabled
                      >
                        Current Plan
                      </Button>
                    )
                  ) : tierKey === "free" ? (
                    <Button
                      variant="ghost"
                      className="w-full rounded-full"
                      disabled
                    >
                      Free Forever
                    </Button>
                  ) : !canPurchase ? (
                    <Button
                      variant="outline"
                      className="w-full rounded-full"
                      disabled
                    >
                      Available on web
                    </Button>
                  ) : (
                    <Button
                      className={`w-full rounded-full shadow-lg shadow-primary/20 font-semibold tracking-wide ${
                        tierKey === "jetx"
                          ? "bg-gradient-primary hover:opacity-90"
                          : ""
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
          },
        )}
      </div>

      {isSubscribed && (
        <div className="text-center">
          <Button
            variant="link"
            onClick={handleManageSubscription}
            disabled={portalLoading}
            className="rounded-full"
          >
            {portalLoading ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : null}
            Manage billing, cancel, or change plan
          </Button>
        </div>
      )}
    </div>
  );
};
