import { useEffect } from "react";
import { useNavigate } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  readCachedOnboardingStatus,
  writeCachedOnboardingStatus,
  isOnboardingSnoozed,
} from "@/lib/onboardingStatus";
import { rememberPostAuthRedirect } from "@/lib/postAuthRedirect";


/**
 * Onboarding gating for the landing route.
 *
 * Only redirects when we *know* the signed-in user hasn't completed
 * onboarding. Uses AuthContext's already-resolved session (no extra
 * getSession round-trip) plus a per-user sessionStorage cache so we don't
 * re-query `profiles` on every mount — this is what kills the
 * `/` <-> `/onboarding` redirect bounce that caused a visible flash.
 *
 * Unauthenticated visitors are never redirected; they can browse `/`.
 */
export function useOnboardingGate() {
  const navigate = useNavigate();
  const { session, isLoading: authLoading } = useAuth();

  useEffect(() => {
    if (authLoading) return;
    if (!session) return;

    const uid = session.user.id;
    // "Skip for later" wins: never bounce a user who postponed onboarding,
    // otherwise / -> /onboarding -> / loops right after they skip.
    if (isOnboardingSnoozed(uid)) return;

    const cached = readCachedOnboardingStatus(uid);
    if (cached === true) return;
    if (cached === false) {
      // Preserve the deep link (e.g. /?venue=abc) so finishing onboarding
      // returns the user to where they were headed instead of bare "/".
      rememberPostAuthRedirect();
      navigate("/onboarding", { replace: true });
      return;
    }

    let cancelled = false;
    void (async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("onboarding_completed")
        .eq("id", uid)
        .single();
      if (cancelled || !profile) return;
      writeCachedOnboardingStatus(uid, !!profile.onboarding_completed);
      if (!profile.onboarding_completed && !isOnboardingSnoozed(uid)) {
        rememberPostAuthRedirect();
        navigate("/onboarding", { replace: true });
      }
    })();


    return () => {
      cancelled = true;
    };
  }, [authLoading, session, navigate]);
}
