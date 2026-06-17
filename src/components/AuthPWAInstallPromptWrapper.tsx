import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PWAInstallPrompt } from "./PWAInstallPrompt";

/**
 * Gates the PWAInstallPrompt to only appear right after a sign-in or sign-up
 * event. Mount this wrapper anywhere in the auth flow (Auth page,
 * VerificationSuccess, post-onboarding). It listens to Supabase auth state
 * changes and uses sessionStorage so the prompt also surfaces on the
 * landing page immediately after redirect.
 *
 * Behaviour:
 *  - SIGNED_IN  → arm the prompt for this browser session
 *  - USER_UPDATED with a fresh email confirmation → arm (post sign-up verify)
 *  - SIGNED_OUT → disarm
 *
 * Additional gates (per product requirement):
 *  - Only renders on the landing route (`/`).
 *  - Only renders once the signed-in user has a profile with
 *    `onboarding_completed = true` (i.e. profile creation finished).
 * The underlying PWAInstallPrompt still respects its own dismissal cooldown,
 * iOS handling, and "already installed" checks.
 */
const ARM_KEY = "pwa-prompt-armed-by-auth";
const ANON_ARM_KEY = "pwa-prompt-anon-armed";
const ANON_DELAY_MS = 8000;

export const AuthPWAInstallPromptWrapper = ({
  /** When true, arms the prompt immediately on mount (e.g. on the
   * post-verification or onboarding screens where we already know the user
   * just authenticated). */
  armOnMount = false,
  /** When true, bypasses the route restriction (used by post-verify/
   * onboarding flows that already know the right moment). */
  ignoreRoute = false,
  /** When true, only show the prompt once the signed-in user has finished
   * onboarding. Defaults to false so the prompt surfaces on every fresh
   * sign-in or sign-up. */
  requireOnboarded = false,
  /** When true, also show the prompt to anonymous visitors with a sign-up
   * CTA after a short engagement delay. */
  showSignUpCtaForAnonymous = false,
}: {
  armOnMount?: boolean;
  ignoreRoute?: boolean;
  requireOnboarded?: boolean;
  showSignUpCtaForAnonymous?: boolean;
} = {}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [profileReady, setProfileReady] = useState(false);
  const [anonArmed, setAnonArmed] = useState(false);

  const [armed, setArmed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return armOnMount || sessionStorage.getItem(ARM_KEY) === "1";
  });

  useEffect(() => {
    if (armOnMount) {
      sessionStorage.setItem(ARM_KEY, "1");
      setArmed(true);
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event) => {
        if (event === "SIGNED_IN" || event === "USER_UPDATED") {
          sessionStorage.setItem(ARM_KEY, "1");
          setArmed(true);
        } else if (event === "SIGNED_OUT") {
          sessionStorage.removeItem(ARM_KEY);
          setArmed(false);
        }
      },
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [armOnMount]);

  // Verify the signed-in user has completed profile creation/onboarding
  // (only when requireOnboarded is true).
  useEffect(() => {
    if (!requireOnboarded) return;
    let cancelled = false;
    if (!user) {
      setProfileReady(false);
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("onboarding_completed")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        setProfileReady(false);
        return;
      }
      setProfileReady(!!data?.onboarding_completed);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, requireOnboarded]);

  // Anonymous arming: after a short delay on the public landing route,
  // surface the sign-up + install prompt for unauthenticated visitors.
  useEffect(() => {
    if (!showSignUpCtaForAnonymous) return;
    if (user) return;
    if (sessionStorage.getItem(ANON_ARM_KEY) === "1") {
      setAnonArmed(true);
      return;
    }
    const t = setTimeout(() => {
      sessionStorage.setItem(ANON_ARM_KEY, "1");
      setAnonArmed(true);
    }, ANON_DELAY_MS);
    return () => clearTimeout(t);
  }, [showSignUpCtaForAnonymous, user]);

  // Route gating applies to both modes.
  if (!ignoreRoute && location.pathname !== "/") return null;

  // Anonymous (signed-out) path with sign-up CTA.
  if (!user) {
    if (!showSignUpCtaForAnonymous || !anonArmed) return null;
    return (
      <PWAInstallPrompt
        signUpCta={{
          onSignUp: () => navigate("/auth?mode=signup"),
          headline: "Create your JET profile",
          subtext: "Save deals, get nearby alerts, install the app",
          buttonLabel: "Sign up — it's free",
        }}
      />
    );
  }

  // Authenticated path — show after sign-in / sign-up.
  if (!armed) return null;
  if (requireOnboarded && !profileReady) return null;
  return <PWAInstallPrompt />;
};

export default AuthPWAInstallPromptWrapper;