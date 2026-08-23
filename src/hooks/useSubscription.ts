import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export type SubscriptionTier = "free" | "jet_plus" | "jetx";

interface SubscriptionData {
  subscribed: boolean;
  tier: SubscriptionTier;
  product_id: string | null;
  subscription_end: string | null;
}

const FREE_STATE: SubscriptionData = {
  subscribed: false,
  tier: "free",
  product_id: null,
  subscription_end: null,
};

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

const VALID_TIERS: SubscriptionTier[] = ["free", "jet_plus", "jetx"];

function normalizeTier(value: unknown): SubscriptionTier {
  return VALID_TIERS.includes(value as SubscriptionTier)
    ? (value as SubscriptionTier)
    : "free";
}

/** An expired `subscription_end` means the row is stale — treat as free. */
function rowToState(row: {
  subscribed: boolean | null;
  tier: string | null;
  product_id: string | null;
  subscription_end: string | null;
}): SubscriptionData {
  const ended =
    !!row.subscription_end && new Date(row.subscription_end) < new Date();
  const subscribed = !!row.subscribed && !ended;
  return {
    subscribed,
    tier: subscribed ? normalizeTier(row.tier) : "free",
    product_id: subscribed ? row.product_id : null,
    subscription_end: row.subscription_end,
  };
}

/**
 * Subscription state is read from `public.subscribers`, which the Stripe
 * webhook keeps authoritative, and kept fresh with a realtime subscription on
 * the caller's own row (RLS scopes it to `auth.uid()`).
 *
 * The previous implementation polled the `check-subscription` edge function
 * every 60s, which round-tripped to Stripe on every tick and could leave the
 * paywall stale for up to a minute right after checkout — the single worst
 * moment for a UX glitch. `syncWithStripe()` remains available as an explicit
 * reconcile for the post-checkout return, but is no longer on a timer.
 */
export const useSubscription = () => {
  const [subscription, setSubscription] = useState<SubscriptionData>(FREE_STATE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const userIdRef = useRef<string | null>(null);

  const readFromDb = useCallback(async () => {
    try {
      setError(null);
      const {
        data: { session },
      } = await supabase.auth.getSession();

      userIdRef.current = session?.user?.id ?? null;
      if (!session) {
        setSubscription(FREE_STATE);
        return;
      }

      const { data, error: dbError } = await supabase
        .from("subscribers")
        .select("subscribed, tier, product_id, subscription_end")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (dbError) throw dbError;
      setSubscription(data ? rowToState(data) : FREE_STATE);
    } catch (err) {
      console.error("Error reading subscription:", err);
      setError(
        err instanceof Error ? err.message : "Failed to read subscription",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Force a reconcile against Stripe. Only for moments where the webhook may
   * not have landed yet (returning from checkout / customer portal) or when
   * the user explicitly asks to refresh — never on a timer.
   */
  const syncWithStripe = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      const { error: fnError } =
        await supabase.functions.invoke("check-subscription");
      if (fnError) throw fnError;
    } catch (err) {
      console.error("Error syncing subscription with Stripe:", err);
    } finally {
      // The edge function writes back to `subscribers`; re-read either way.
      await readFromDb();
    }
  }, [readFromDb]);

  const createCheckout = async (priceId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke(
        "create-checkout",
        { body: { priceId } },
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
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const subscribeToRow = (userId: string) => {
      channel = supabase
        .channel(`subscribers-${userId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "subscribers",
            filter: `user_id=eq.${userId}`,
          },
          () => {
            if (!cancelled) void readFromDb();
          },
        )
        .subscribe();
    };

    const bootstrap = async () => {
      await readFromDb();
      if (cancelled) return;
      if (userIdRef.current) subscribeToRow(userIdRef.current);
    };

    void bootstrap();

    // Returning from the Stripe-hosted checkout tab: reconcile once so the
    // paywall unlocks immediately even if the webhook is a beat behind.
    const onFocus = () => {
      if (document.visibilityState === "visible") void readFromDb();
    };
    document.addEventListener("visibilitychange", onFocus);

    const {
      data: { subscription: authSub },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextId = session?.user?.id ?? null;
      if (nextId === userIdRef.current) return;
      if (channel) {
        supabase.removeChannel(channel);
        channel = null;
      }
      void readFromDb().then(() => {
        if (!cancelled && userIdRef.current) subscribeToRow(userIdRef.current);
      });
    });

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onFocus);
      if (channel) supabase.removeChannel(channel);
      authSub.unsubscribe();
    };
  }, [readFromDb]);

  return {
    subscription,
    loading,
    error,
    /** Re-read the authoritative row from the database. */
    checkSubscription: readFromDb,
    /** Explicit Stripe reconcile — use sparingly (post-checkout only). */
    syncWithStripe,
    createCheckout,
    openCustomerPortal,
    isSubscribed: subscription.subscribed,
    tier: subscription.tier,
    tierInfo: SUBSCRIPTION_TIERS[subscription.tier],
  };
};
