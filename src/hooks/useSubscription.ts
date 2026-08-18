import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type SubscriptionTier = "free" | "jet_plus" | "jetx";

interface SubscriptionData {
  subscribed: boolean;
  tier: SubscriptionTier;
  product_id: string | null;
  subscription_end: string | null;
}

export const SUBSCRIPTION_TIERS = {
  free: {
    name: "JET",
    price: 0,
    priceId: null,
    productId: null,
    features: [
      "Deal discovery",
      "Favorites & bookmarks",
      "Search history",
      "Location-based alerts",
    ],
  },
  jet_plus: {
    name: "JET+",
    price: 6.99,
    priceId: "price_1ScFIAQXf8KQnoU8bIfQjJWt",
    productId: "prod_TZO4ZimXhwOsHJ",
    features: [
      "Everything in JET",
      "Friend connections",
      "Social deal sharing",
      "Venue reviews",
      "Priority support",
    ],
  },
  jetx: {
    name: "JETx",
    price: 12.99,
    priceId: "price_1ScFIeQXf8KQnoU8XoK4ya9D",
    productId: "prod_TZO4046HaI8g2t",
    features: [
      "Everything in JET+",
      "VIP exclusive deals",
      "Concierge service",
      "Priority venue access",
      "Early access to features",
    ],
  },
} as const;

export const useSubscription = () => {
  const [subscription, setSubscription] = useState<SubscriptionData>({
    subscribed: false,
    tier: "free",
    product_id: null,
    subscription_end: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const checkSubscription = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setSubscription({
          subscribed: false,
          tier: "free",
          product_id: null,
          subscription_end: null,
        });
        return;
      }

      const { data, error: fnError } =
        await supabase.functions.invoke("check-subscription");

      if (fnError) throw fnError;

      setSubscription({
        subscribed: data.subscribed,
        tier: data.tier as SubscriptionTier,
        product_id: data.product_id,
        subscription_end: data.subscription_end,
      });
    } catch (err) {
      console.error("Error checking subscription:", err);
      setError(
        err instanceof Error ? err.message : "Failed to check subscription",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const createCheckout = async (priceId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke(
        "create-checkout",
        {
          body: { priceId },
        },
      );

      if (error) throw error;
      if (data?.url) {
        window.open(data.url, "_blank");
      }
    } catch (err) {
      console.error("Error creating checkout:", err);
      throw err;
    }
  };

  const openCustomerPortal = async () => {
    try {
      const { data, error } =
        await supabase.functions.invoke("customer-portal");

      if (error) throw error;
      if (data?.url) {
        window.open(data.url, "_blank");
      }
    } catch (err) {
      console.error("Error opening customer portal:", err);
      throw err;
    }
  };

  useEffect(() => {
    checkSubscription();

    // Refresh subscription status every minute
    const interval = setInterval(checkSubscription, 60000);

    // Listen for auth changes
    const {
      data: { subscription: authSub },
    } = supabase.auth.onAuthStateChange(() => {
      checkSubscription();
    });

    return () => {
      clearInterval(interval);
      authSub.unsubscribe();
    };
  }, [checkSubscription]);

  return {
    subscription,
    loading,
    error,
    checkSubscription,
    createCheckout,
    openCustomerPortal,
    isSubscribed: subscription.subscribed,
    tier: subscription.tier,
    tierInfo: SUBSCRIPTION_TIERS[subscription.tier],
  };
};
