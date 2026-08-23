import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { SubscriptionTier } from "@/hooks/useSubscription";

/**
 * Server-verified subscription tier.
 *
 * The client-side `useSubscription` row read is a UX convenience and can be
 * tampered with in the browser. This hook resolves the tier through the
 * database function `public.effective_subscription_tier()`, which derives it
 * from the Stripe-owned `subscribers` row (expired rows collapse to `free`)
 * and can only ever resolve the caller's own tier.
 *
 * Feature gates take the *stricter* of the client and server answers, and the
 * database RLS policies on the gated tables enforce the same rule on write.
 */
export function useVerifiedTier() {
  const [tier, setTier] = useState<SubscriptionTier | null>(null);
  const [loading, setLoading] = useState(true);
  const cancelledRef = useRef(false);

  const verify = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        if (!cancelledRef.current) setTier("free");
        return;
      }

      const { data, error } = await supabase.rpc(
        "effective_subscription_tier",
        {},
      );
      if (error) throw error;

      const value =
        data === "jetx" || data === "jet_plus" ? data : ("free" as const);
      if (!cancelledRef.current) setTier(value);
    } catch (err) {
      console.error("Failed to verify subscription tier:", err);
      // Fail closed: an unverified session is treated as free.
      if (!cancelledRef.current) setTier("free");
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    void verify();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void verify();
    });

    return () => {
      cancelledRef.current = true;
      subscription.unsubscribe();
    };
  }, [verify]);

  return { verifiedTier: tier, verifying: loading, revalidate: verify };
}
