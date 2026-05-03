import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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
 * The underlying PWAInstallPrompt still respects its own dismissal cooldown,
 * iOS handling, and "already installed" checks.
 */
const ARM_KEY = "pwa-prompt-armed-by-auth";

export const AuthPWAInstallPromptWrapper = ({
  /** When true, arms the prompt immediately on mount (e.g. on the
   * post-verification or onboarding screens where we already know the user
   * just authenticated). */
  armOnMount = false,
}: {
  armOnMount?: boolean;
} = {}) => {
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

  if (!armed) return null;
  return <PWAInstallPrompt />;
};

export default AuthPWAInstallPromptWrapper;