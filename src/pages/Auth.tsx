import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams, useLocation, Link } from "react-router";
import { supabase } from "@/integrations/supabase/client";
import { IconButton } from "@/components/ui/icon-button";
import { AuthButton } from "@/components/auth/AuthButton";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff, Mail, Lock, ArrowLeft, AlertCircle, CheckCircle2 } from "lucide-react";
import { z } from "zod";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/contexts/AuthContext";
import { consumePostAuthRedirect } from "@/lib/postAuthRedirect";
import { writeCachedOnboardingStatus } from "@/lib/onboardingStatus";
import { discardCurrentAuthSession } from "@/lib/authSession";
import { SEO } from "@/components/SEO";
import { AuthPWAInstallPromptWrapper } from "@/components/AuthPWAInstallPromptWrapper";
// Use the new JET logo for auth page
import jetLogo from "@/assets/jet-auth-logo.png";
import authBackground from "@/assets/auth-background.webp";


// Enhanced validation schemas
const emailSchema = z.string()
  .trim()
  .email({ message: "Please enter a valid email address" })
  .max(255, { message: "Email must be less than 255 characters" });

const passwordSchema = z.string()
  .min(8, { message: "Password must be at least 8 characters" })
  .max(72, { message: "Password must be less than 72 characters" })
  .regex(/[A-Z]/, { message: "Password must contain at least one uppercase letter" })
  .regex(/[a-z]/, { message: "Password must contain at least one lowercase letter" })
  .regex(/[0-9]/, { message: "Password must contain at least one number" });

type AuthMode = "signin" | "signup" | "forgot" | "reset";
type FieldName = "email" | "password" | "confirmPassword";
type ValidationErrors = Partial<Record<FieldName | "consent" | "locationConsent", string>>;

/** Always send Supabase email links to the production origin when running locally. */
const getAppUrl = (): string =>
  window.location.origin.includes("localhost")
    ? "https://jet-around.com"
    : window.location.origin;

const Auth = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const [isLoading, setIsLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({});
  const [showResendVerification, setShowResendVerification] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [isResending, setIsResending] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [dataProcessingConsent, setDataProcessingConsent] = useState(false);
  const [locationConsent, setLocationConsent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const { user: authUser, isLoading: authLoading } = useAuth();
  // True while we're holding the form back because an already-authenticated
  // user is about to be redirected (prevents the form flashing for a frame).
  const [isRedirecting, setIsRedirecting] = useState(false);

  const mode: AuthMode = isResettingPassword
    ? "reset"
    : isForgotPassword
    ? "forgot"
    : isSignUp
    ? "signup"
    : "signin";

  // If already signed in, route based on onboarding status (covers OAuth return
  // and revisits to /auth by an authenticated user).
  useEffect(() => {
    if (!authUser || (mode !== "signin" && mode !== "signup")) return;
    let cancelled = false;
    setIsRedirecting(true);
    (async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("onboarding_completed")
        .eq("id", authUser.id)
        .maybeSingle();
      if (cancelled) return;
      const completed = !!profile?.onboarding_completed;
      writeCachedOnboardingStatus(authUser.id, completed);
      const target = completed
        ? consumePostAuthRedirect("/")
        : "/onboarding";
      navigate(target, { replace: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [authUser, mode, navigate]);

  // Sync auth mode with URL: /signup → signup, /signin or /auth → signin.
  // Also supports legacy ?mode=signup query param on /auth.
  useEffect(() => {
    const path = location.pathname;
    const queryMode = searchParams.get('mode');
    if (path === '/signup' || queryMode === 'signup') {
      setIsSignUp(true);
    } else if (path === '/signin' || path === '/auth' || queryMode === 'signin') {
      setIsSignUp(false);
    }
  }, [location.pathname, searchParams]);

  // Check if user is coming from password reset email
  useEffect(() => {
    const checkResetMode = async () => {
      const resetParam = searchParams.get('reset');
      if (resetParam === 'true') {
        // Verify there's a valid session from the reset link
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          setIsResettingPassword(true);
        } else {
          toast.error("Invalid or expired reset link", {
            description: "Please request a new password reset link.",
          });
        }
      }
    };
    checkResetMode();
  }, [searchParams]);

  // Cooldown timer for resend verification
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => {
        setResendCooldown(resendCooldown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  // Detect when the user has already verified their email so we can
  // short-circuit the resend button and avoid 422 errors from Supabase.
  useEffect(() => {
    if (!showResendVerification) return;
    let cancelled = false;
    const checkVerified = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      const verified = !!user?.email_confirmed_at || !!(user as any)?.confirmed_at;
      setIsVerified(verified);
      if (verified) {
        setSuccessMessage("Your email is verified. You can sign in now.");
      }
    };
    checkVerified();
    const interval = setInterval(checkVerified, 10000);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") checkVerified();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [showResendVerification]);

  // Single-field validation for inline feedback
  const getFieldError = (field: FieldName, value?: string, compareValue?: string): string | undefined => {
    const fieldValue = value ?? (field === "email" ? email : field === "password" ? password : confirmPassword);

    if (field === "email") {
      const result = emailSchema.safeParse(fieldValue);
      return result.success ? undefined : result.error.errors[0].message;
    }
    if (field === "password") {
      if (mode === "signup" || mode === "reset") {
        const result = passwordSchema.safeParse(fieldValue);
        return result.success ? undefined : result.error.errors[0].message;
      }
      if (mode === "signin" && !fieldValue) {
        return "Password is required";
      }
      return undefined;
    }
    if (field === "confirmPassword") {
      const pw = compareValue ?? password;
      if ((mode === "signup" || mode === "reset") && pw !== fieldValue) {
        return "Passwords do not match";
      }
      return undefined;
    }
    return undefined;
  };

  const fieldToElementId: Record<string, string> = {
    email: "auth-email",
    password: "auth-password",
    confirmPassword: "auth-confirm-password",
    consent: "dataConsent",
    locationConsent: "locationConsent",
  };

  const focusFirstError = (errors: ValidationErrors) => {
    const firstKey = (Object.keys(errors) as (keyof typeof errors)[]).find((k) => errors[k]);
    if (!firstKey) return;
    const elId = fieldToElementId[firstKey as string];
    if (!elId) return;
    window.setTimeout(() => {
      const el = document.getElementById(elId);
      if (el) {
        (el as HTMLElement).focus();
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 0);
  };

  const getAutofillAwareValue = (field: FieldName): string => {
    const id = fieldToElementId[field];
    const el = id ? (document.getElementById(id) as HTMLInputElement | null) : null;
    return el?.value ?? (field === "email" ? email : field === "password" ? password : confirmPassword);
  };

  const validateInputs = (): boolean => {
    const errors: ValidationErrors = {};
    const values = {
      email: getAutofillAwareValue("email"),
      password: getAutofillAwareValue("password"),
      confirmPassword: getAutofillAwareValue("confirmPassword"),
    };

    // Ensure React state matches any browser-autofilled values before validation.
    (Object.keys(values) as FieldName[]).forEach((field) => {
      const stateValue = field === "email" ? email : field === "password" ? password : confirmPassword;
      if (values[field] !== stateValue) {
        handleFieldChange(field, values[field]);
      }
    });

    // Email is required in every mode except "reset" (no email field shown).
    if (mode !== "reset") {
      const emailErr = getFieldError("email", values.email);
      if (emailErr) errors.email = emailErr;
    }

    if (mode !== "forgot") {
      const pwErr = getFieldError("password", values.password);
      if (pwErr) errors.password = pwErr;

      const confirmErr = getFieldError("confirmPassword", values.confirmPassword, values.password);
      if (confirmErr) errors.confirmPassword = confirmErr;

      if (mode === "signup") {
        if (!dataProcessingConsent) {
          errors.consent = "You must agree to the Privacy Policy and Terms of Service";
        }
        if (!locationConsent) {
          errors.locationConsent = "Location consent is required to receive personalized deals";
        }
      }
    }

    setValidationErrors(errors);
    const ok = Object.keys(errors).length === 0;
    if (!ok) {
      // Surface the first error at the form level + trigger shake.
      const first = Object.values(errors).find(Boolean) as string | undefined;
      setFormError(first ?? "Please fix the highlighted fields.");
      setShake(true);
      window.setTimeout(() => setShake(false), 450);
      focusFirstError(errors);
    } else {
      setFormError(null);
    }
    return ok;
  };

  const handleBlur = (field: FieldName) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    const error = getFieldError(field);
    setValidationErrors((prev) => ({ ...prev, [field]: error }));
  };

  const handleFieldChange = (field: FieldName, value: string) => {
    if (field === "email") setEmail(value);
    if (field === "password") setPassword(value);
    if (field === "confirmPassword") setConfirmPassword(value);

    if (touched[field]) {
      const error = getFieldError(field);
      setValidationErrors((prev) => ({ ...prev, [field]: error }));
    } else {
      setValidationErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  /** Reset transient form state and bounce the user back to the sign-in tab. */
  const resetToSignIn = useCallback(() => {
    setIsSignUp(false);
    setIsForgotPassword(false);
    setPassword("");
    setConfirmPassword("");
    setDataProcessingConsent(false);
    setLocationConsent(false);
  }, []);

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    try {
      // Route OAuth callback through /auth so the authUser effect above
      // can route new Google users to /onboarding and returning users to
      // their remembered deep link via consumePostAuthRedirect.
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: `${window.location.origin}/auth`,
        extraParams: { prompt: "select_account" },
      });
      if (result.error) {
        throw result.error;
      }
      if (result.redirected) {
        return;
      }
      toast.success("Signed in with Google");
      // Post-OAuth routing is handled by the authUser effect above, which
      // checks onboarding_completed and the remembered redirect.
    } catch (err) {
      const message = err instanceof Error ? err.message : "Please try again or use email sign-in.";
      toast.error("Google sign-in failed", {
        description: message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  /** Map common Supabase error messages to a uniform toast. Returns true if handled. */
  const handleCommonAuthError = (error: { message?: string } | null | undefined): boolean => {
    const msg = error?.message?.toLowerCase() ?? "";
    if (msg.includes("rate limit")) {
      toast.error("Too many attempts", {
        description: "Please wait a few minutes before trying again.",
      });
      return true;
    }
    return false;
  };

  const handleResendVerification = async () => {
    // Short-circuit if the user already verified to avoid Supabase 422 errors.
    if (isVerified) {
      toast.success("Already verified", {
        description: "Your email is verified. Sign in to continue.",
      });
      navigate("/auth?mode=signin", { replace: true });
      return;
    }

    // Validate email first
    const emailResult = emailSchema.safeParse(email);
    if (!emailResult.success) {
      toast.error("Invalid email", {
        description: emailResult.error.errors[0].message,
      });
      return;
    }

    if (resendCooldown > 0) {
      toast.error("Please wait", {
        description: `You can resend in ${resendCooldown} seconds.`,
      });
      return;
    }

    setIsResending(true);

    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim(),
        options: { emailRedirectTo: `${getAppUrl()}/verification-success` },
      });

      if (error) {
        if (handleCommonAuthError(error)) {
          setResendCooldown(60);
          return;
        }
        throw error;
      }

      toast.success("Verification email sent!", {
        description: "Please check your inbox and spam folder.",
      });
      setResendCooldown(60); // 60 second cooldown
    } catch (err) {
      const message = err instanceof Error ? err.message.toLowerCase() : "";
      if (
        message.includes("already verified") ||
        message.includes("email already confirmed") ||
        message.includes("user already confirmed")
      ) {
        toast.success("Already verified", {
          description: "Your email is verified. Sign in to continue.",
        });
        setIsVerified(true);
        navigate("/auth?mode=signin", { replace: true });
        return;
      }
      toast.error("Failed to resend email", {
        description: "Please try again or contact support if the issue persists.",
      });
    } finally {
      setIsResending(false);
    }
  };

  // -- Per-mode action handlers (each returns; outer dispatcher manages
  // shared validation, loading state, and the generic error fallback).

  const doSignUp = async () => {
    const { data: signUpData, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: `${getAppUrl()}/verification-success` },
    });

    const accountExistsToast = () =>
      toast.error("Account already exists", {
        description: "This email is already registered. Please sign in instead.",
      });

    if (error) {
      const msg = error.message?.toLowerCase() ?? "";
      if (
        msg.includes("already registered") ||
        msg.includes("already been registered") ||
        msg.includes("user already exists")
      ) {
        accountExistsToast();
        resetToSignIn();
        return;
      }
      if (handleCommonAuthError(error)) return;
      throw error;
    }

    // Supabase returns a user with empty `identities` when the email is already
    // registered (no error thrown) — surface it instead of silently "succeeding".
    const identities = (signUpData.user as { identities?: unknown[] } | null)?.identities;
    if (signUpData.user && Array.isArray(identities) && identities.length === 0) {
      accountExistsToast();
      resetToSignIn();
      return;
    }

    // Persist consent on the freshly created profile.
    if (signUpData.user) {
      await supabase
        .from("profiles")
        .update({
          data_processing_consent: dataProcessingConsent,
          data_processing_consent_date: new Date().toISOString(),
          location_consent_given: locationConsent,
          location_consent_date: locationConsent ? new Date().toISOString() : null,
        })
        .eq("id", signUpData.user.id);

      // Seed granular consent records based on the boxes the user just ticked.
      // Location consent at signup unlocks both foreground and background
      // location tracking by default; users can revoke either one at any
      // time from Settings → Privacy.
      const now = new Date().toISOString();
      const seedRows = [
        {
          user_id: signUpData.user.id,
          consent_type: "foreground_location" as const,
          granted: locationConsent,
          policy_version: "2025-06",
          source: "auth.signup",
          granted_at: locationConsent ? now : null,
          revoked_at: locationConsent ? null : now,
        },
        {
          user_id: signUpData.user.id,
          consent_type: "background_tracking" as const,
          granted: locationConsent,
          policy_version: "2025-06",
          source: "auth.signup",
          granted_at: locationConsent ? now : null,
          revoked_at: locationConsent ? null : now,
        },
      ];
      await supabase.from("user_consents").insert(seedRows);
    }

    toast.success("Check your email!", {
      description:
        'We sent you a verification link. If it doesn\'t arrive in a minute, tap "Resend verification email" below.',
      duration: 8000,
    });
    localStorage.setItem("jet_verification_email", email.trim().toLowerCase());
    setShowResendVerification(true);
    setPassword("");
    setConfirmPassword("");
    setDataProcessingConsent(false);
    setLocationConsent(false);
  };

  const doSignIn = async () => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      const msg = error.message ?? "";
      if (msg.includes("Invalid login credentials")) {
        toast.error("Invalid credentials", {
          description: "The email or password you entered is incorrect.",
        });
        return;
      }
      if (msg.includes("Email not confirmed")) {
        toast.error("Email not verified", {
          description: "Your verification link may have expired. Tap \"Resend Verification Email\" below to get a fresh one.",
        });
        localStorage.setItem("jet_verification_email", email.trim().toLowerCase());
        setShowResendVerification(true);
        return;
      }
      if (handleCommonAuthError(error)) return;
      throw error;
    }

    if (!data.user.email_confirmed_at) {
      discardCurrentAuthSession();
      toast.error("Email not verified", {
        description: "Verification links expire after a short time. Tap \"Resend Verification Email\" below to get a new one.",
      });
      localStorage.setItem("jet_verification_email", email.trim().toLowerCase());
      setShowResendVerification(true);
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarding_completed")
      .eq("id", data.user.id)
      .single();

    toast.success("Signed in successfully");
    const completed = !!profile?.onboarding_completed;
    writeCachedOnboardingStatus(data.user.id, completed);
    navigate(
      completed ? consumePostAuthRedirect("/") : "/onboarding",
      { replace: true },
    );
  };

  const doForgotPassword = async () => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${getAppUrl()}/auth?reset=true`,
    });
    if (error) {
      if (handleCommonAuthError(error)) return;
      throw error;
    }
    toast.success("Password reset email sent", {
      description: "Check your email for the password reset link.",
    });
    setEmail("");
    setIsForgotPassword(false);
  };

  const doPasswordReset = async () => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      if (handleCommonAuthError(error)) return;
      throw error;
    }
    toast.success("Password updated successfully", {
      description: "You can now sign in with your new password.",
    });
    setSuccessMessage("Password updated — redirecting you to sign in…");
    setPassword("");
    setConfirmPassword("");
    window.setTimeout(() => {
      setSuccessMessage(null);
      setIsResettingPassword(false);
      navigate("/auth");
    }, 1200);
  };

  /** Single submit pipeline: validate → dispatch by mode → unified error/loading handling. */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationErrors({});
    if (!validateInputs()) return;

    setIsLoading(true);
    try {
      switch (mode) {
        case "signup":
          await doSignUp();
          break;
        case "signin":
          await doSignIn();
          break;
        case "forgot":
          await doForgotPassword();
          break;
        case "reset":
          await doPasswordReset();
          break;
      }
    } catch {
      toast.error("Authentication error", {
        description: "An unexpected error occurred. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const subtitle =
    mode === "reset"
      ? "Set your new password to secure your account."
      : mode === "forgot"
      ? "We'll email you a secure link to reset your password."
      : mode === "signup"
      ? "Join JET and discover what's hot near you."
      : "Sign in to discover what's hot in your area.";

  const primaryLabel =
    mode === "reset"
      ? "Update Password"
      : mode === "forgot"
      ? "Send Reset Link"
      : mode === "signup"
      ? "Create Account"
      : "Sign In";

  // Dynamic SEO per mode so /signin, /signup, and recovery views have
  // distinct titles, descriptions, and canonical paths.
  const seoTitle =
    mode === "signup"
      ? "Create your JET account — Charlotte's Live City Pulse"
      : mode === "forgot"
      ? "Reset your JET password"
      : mode === "reset"
      ? "Set a new JET password"
      : "Sign in to JET — Charlotte's Live City Pulse";
  const seoDescription =
    mode === "signup"
      ? "Create your JET account to unlock real-time deals, events, and trending venues across Charlotte, NC."
      : mode === "forgot" || mode === "reset"
      ? "Reset your JET password to get back to discovering what's hot in Charlotte, NC."
      : "Sign in to JET to discover real-time deals, events, and trending venues across Charlotte, NC.";
  const seoPath =
    mode === "signup" ? "/signup" : mode === "signin" ? "/signin" : "/auth";

  const switchToMode = (next: "signin" | "signup") => {
    setIsSignUp(next === "signup");
    setIsForgotPassword(false);
    setShowResendVerification(false);
    setValidationErrors({});
    setPassword("");
    setConfirmPassword("");
    setDataProcessingConsent(false);
    setLocationConsent(false);
    // Keep the URL in sync so the screen has a shareable, distinct path.
    const targetPath = next === "signup" ? "/signup" : "/signin";
    if (location.pathname !== targetPath) {
      navigate(targetPath, { replace: true });
    }
  };

  // While the auth context is still hydrating, or while we're about to
  // redirect an already-signed-in user away from /auth, render a centered
  // loader instead of the form. This eliminates the brief flash where the
  // sign-in form mounts and then immediately unmounts on redirect.
  if (authLoading || (isRedirecting && (mode === "signin" || mode === "signup"))) {
    return (
      <div
        className="relative flex flex-1 min-h-0 w-full items-center justify-center bg-background"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <SEO
          title={seoTitle}
          description={seoDescription}
          path={seoPath}
        />
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
        <span className="sr-only">Loading sign-in…</span>
      </div>
    );
  }

  return (
    <div className="auth-fullscreen relative flex flex-col flex-1 min-h-0 w-full overflow-y-auto">
      <SEO
        title={seoTitle}
        description={seoDescription}
        path={seoPath}
      />
      {/* Full-bleed background image */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${authBackground})` }}
        aria-hidden="true"
      />
      {/* Dark overlay — uses background token so it adapts with theme */}
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-background/85 via-background/70 to-background/90"
        aria-hidden="true"
      />
      {/* Animated radial mesh gradient */}
      <div className="pointer-events-none absolute inset-0 auth-mesh-gradient" aria-hidden="true" />
      {/* Geometric pattern (low opacity) */}
      <div className="pointer-events-none absolute inset-0 auth-geo-pattern" aria-hidden="true" />
      {/* Floating shapes */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <span className="auth-float-shape auth-float-shape--1" />
        <span className="auth-float-shape auth-float-shape--2" />
        <span className="auth-float-shape auth-float-shape--3" />
      </div>

      {/* Centered content — column flex fills the viewport and centers the card both axes */}
      <div className="auth-content-wrapper relative z-10 flex w-full flex-1 flex-col items-center justify-center px-4 sm:px-6 md:px-8 pt-[max(env(safe-area-inset-top,0px),12px)] sm:pt-[max(env(safe-area-inset-top,0px),20px)] pb-[max(env(safe-area-inset-bottom,0px),12px)] sm:pb-[max(env(safe-area-inset-bottom,0px),20px)]">
        <div className="w-full max-w-[420px] mx-auto flex flex-col items-center animate-fade-in">
          {/* Logo above card */}
          <div className="auth-logo flex flex-col items-center mb-4 sm:mb-5">
            <img
              src={jetLogo}
              alt="JET — Live City Pulse logo"
              width="48"
              height="48"
              className="h-12 w-12 drop-shadow-[0_6px_22px_hsl(var(--primary)/0.55)]"
              fetchPriority="high"
              decoding="async"
            />
            <span className="mt-3 inline-flex items-center gap-2 rounded-full border border-border/40 bg-card/30 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-foreground/75 backdrop-blur-sm">
              <span className="dot-gold" />
              Charlotte, NC
            </span>
          </div>

          {/* Centered Card */}
          <div className={`auth-card ${shake ? "auth-shake" : ""}`}>
            <div key={mode} className="auth-crossfade">
              {/* Title */}
              <div className="auth-title flex flex-col items-center gap-1.5 text-center mb-4 sm:mb-5">
            <h1 className="heading-luxe-gradient text-[26px] sm:text-[28px] leading-tight m-0">
              {mode === "signup"
                ? "Create your account"
                : mode === "forgot"
                ? "Reset password"
                : mode === "reset"
                ? "New password"
                : "Welcome back"}
            </h1>
            <p className="text-fluid-sm text-muted-foreground max-w-[320px]">
              {subtitle}
            </p>
          </div>

          {/* Form (relative so the loading overlay positions correctly) */}
          <form
            onSubmit={handleSubmit}
            className="auth-form relative flex flex-col gap-3 sm:gap-4"
            aria-busy={isLoading}
            aria-label={
              mode === "signup"
                ? "Create account form"
                : mode === "forgot"
                ? "Forgot password form"
                : mode === "reset"
                ? "Reset password form"
                : "Sign in form"
            }
          >
            {isLoading && (
              <div className="auth-loading-overlay" aria-hidden="true">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            )}

            {/* Email field */}
            {!isResettingPassword && (
                <div className="flex flex-col gap-1 sm:gap-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-foreground/80 text-left" htmlFor="auth-email">
                  Email
                </label>
                <div className="relative">
                  <Mail
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    id="auth-email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => handleFieldChange("email", e.target.value)}
                    onInput={(e) => handleFieldChange("email", e.currentTarget.value)}
                    onBlur={() => handleBlur("email")}
                    required
                    disabled={isLoading}
                    aria-invalid={!!validationErrors.email}
                    aria-describedby={validationErrors.email ? "auth-email-error" : undefined}
                    className={`auth-input !pl-11 ${validationErrors.email ? "auth-input-error" : ""}`}
                    autoComplete="email"
                  />
                </div>
                {validationErrors.email && (
                  <p id="auth-email-error" className="auth-field-error">
                    <AlertCircle aria-hidden="true" />
                    {validationErrors.email}
                  </p>
                )}
              </div>
            )}

            {/* Password */}
            {!isForgotPassword && (
              <>
                  <div className="flex flex-col gap-1 sm:gap-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold uppercase tracking-wider text-foreground/80" htmlFor="auth-password">
                      Password
                    </label>
                    {mode === "signin" && (
                      <AuthButton
                        variant="link"
                        size="sm"
                        onClick={() => setIsForgotPassword(true)}
                        disabled={isLoading}
                        className="text-xs"
                      >
                        Forgot?
                      </AuthButton>
                    )}
                  </div>
                  <div className="relative">
                    <Lock
                      aria-hidden="true"
                      className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    />
                    <Input
                      id="auth-password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => handleFieldChange("password", e.target.value)}
                      onInput={(e) => handleFieldChange("password", e.currentTarget.value)}
                      onBlur={() => handleBlur("password")}
                      required
                      disabled={isLoading}
                      aria-invalid={!!validationErrors.password}
                      aria-describedby={validationErrors.password ? "auth-password-error" : undefined}
                      className={`auth-input !pl-11 !pr-12 ${validationErrors.password ? "auth-input-error" : ""}`}
                      autoComplete={isSignUp ? "new-password" : "current-password"}
                    />
                    <IconButton
                      onClick={() => setShowPassword(!showPassword)}
                      ariaLabel={showPassword ? "Hide password" : "Show password"}
                      ariaPressed={showPassword}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2"
                    >
                      {showPassword ? <EyeOff /> : <Eye />}
                    </IconButton>
                  </div>
                  {validationErrors.password ? (
                    <p id="auth-password-error" className="auth-field-error">
                      <AlertCircle aria-hidden="true" />
                      {validationErrors.password}
                    </p>
                  ) : (isSignUp || isResettingPassword) ? (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      8+ characters with uppercase, lowercase, and number
                    </p>
                  ) : null}
                </div>

                {(isSignUp || isResettingPassword) && (
                  <div className="flex flex-col gap-1 sm:gap-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-foreground/80 text-left" htmlFor="auth-confirm-password">
                      Confirm Password
                    </label>
                    <div className="relative">
                      <Lock
                        aria-hidden="true"
                        className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                      />
                      <Input
                        id="auth-confirm-password"
                        type={showConfirmPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={confirmPassword}
                        onChange={(e) => handleFieldChange("confirmPassword", e.target.value)}
                        onInput={(e) => handleFieldChange("confirmPassword", e.currentTarget.value)}
                        onBlur={() => handleBlur("confirmPassword")}
                        required
                        disabled={isLoading}
                        aria-invalid={!!validationErrors.confirmPassword}
                        aria-describedby={validationErrors.confirmPassword ? "auth-confirm-password-error" : undefined}
                        className={`auth-input !pl-11 !pr-12 ${validationErrors.confirmPassword ? "auth-input-error" : ""}`}
                        autoComplete="new-password"
                      />
                      <IconButton
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        ariaLabel={showConfirmPassword ? "Hide password" : "Show password"}
                        ariaPressed={showConfirmPassword}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2"
                      >
                        {showConfirmPassword ? <EyeOff /> : <Eye />}
                      </IconButton>
                    </div>
                    {validationErrors.confirmPassword && (
                      <p id="auth-confirm-password-error" className="auth-field-error">
                        <AlertCircle aria-hidden="true" />
                        {validationErrors.confirmPassword}
                      </p>
                    )}
                  </div>
                )}

                {/* Signup consent */}
                {isSignUp && (
                  <div className="flex flex-col gap-2 sm:gap-3 pt-1">
                    <div className="flex items-start gap-3">
                      <Checkbox
                        id="dataConsent"
                        checked={dataProcessingConsent}
                        onCheckedChange={(checked) => {
                          setDataProcessingConsent(checked === true);
                          setValidationErrors((prev) => ({ ...prev, consent: undefined }));
                        }}
                        disabled={isLoading}
                        className="mt-0.5"
                      />
                      <label htmlFor="dataConsent" className="cursor-pointer text-xs leading-relaxed text-foreground/85">
                        I agree to the{" "}
                        <Link to="/privacy-policy" target="_blank" className="font-medium text-primary underline-offset-4 hover:underline">
                          Privacy Policy
                        </Link>{" "}
                        and{" "}
                        <Link to="/terms-of-service" target="_blank" className="font-medium text-primary underline-offset-4 hover:underline">
                          Terms of Service
                        </Link>
                        <span aria-hidden="true" className="text-destructive ml-0.5">*</span>
                      </label>
                    </div>
                    {validationErrors.consent && (
                      <p id="auth-consent-error" className="auth-field-error auth-field-error--indented">
                        <AlertCircle aria-hidden="true" />
                        {validationErrors.consent}
                      </p>
                    )}

                    <div className="flex items-start gap-3">
                      <Checkbox
                        id="locationConsent"
                        checked={locationConsent}
                        onCheckedChange={(checked) => {
                          setLocationConsent(checked === true);
                          setValidationErrors((prev) => ({ ...prev, locationConsent: undefined }));
                        }}
                        disabled={isLoading}
                        className="mt-0.5"
                      />
                      <label htmlFor="locationConsent" className="cursor-pointer text-xs leading-relaxed text-foreground/85">
                        I consent to location tracking for personalized deals and alerts. Manage in Profile anytime.
                        <span aria-hidden="true" className="text-destructive ml-0.5">*</span>
                      </label>
                    </div>
                    {validationErrors.locationConsent && (
                      <p id="auth-location-consent-error" className="auth-field-error auth-field-error--indented">
                        <AlertCircle aria-hidden="true" />
                        {validationErrors.locationConsent}
                      </p>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Form-level error alert */}
            {formError && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-xs text-destructive"
              >
                <AlertCircle aria-hidden="true" className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span className="leading-snug">{formError}</span>
              </div>
            )}
            {successMessage && (
              <div
                role="status"
                className="flex items-start gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5 text-xs text-emerald-400"
              >
                <CheckCircle2 aria-hidden="true" className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span className="leading-snug">{successMessage}</span>
              </div>
            )}

            <AuthButton
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              loading={isLoading}
              className="mt-0 sm:mt-1"
            >
              {primaryLabel}
            </AuthButton>
          </form>

          {/* Social section */}
          {(mode === "signin" || mode === "signup") && (
            <>
                <div className="auth-social flex items-center gap-3 my-4 sm:my-5">
                <div className="h-px flex-1 bg-border/40" />
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground">or continue with</span>
                <div className="h-px flex-1 bg-border/40" />
              </div>
                <AuthButton
                  onClick={handleGoogleSignIn}
                  loading={isLoading}
                  variant="secondary"
                  size="lg"
                  fullWidth
                  className="auth-google"
                  leftIcon={
                  <svg className="h-5 w-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" fill="#4285F4" />
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                }
              >
                Continue with Google
              </AuthButton>
            </>
          )}

          {/* Resend Verification */}
          {showResendVerification && !isResettingPassword && (
            <div className="mt-4 sm:mt-5 flex flex-col gap-2 rounded-xl border border-primary/25 bg-card/40 p-4 backdrop-blur-md">
              <div className="text-center text-xs text-muted-foreground">
                {isVerified
                  ? "Your email is verified. Sign in to get started."
                  : "Didn't receive the verification email, or did your link expire?"}
              </div>
              <AuthButton
                onClick={handleResendVerification}
                disabled={!isVerified && resendCooldown > 0}
                loading={isResending}
                variant={isVerified ? "primary" : "secondary"}
                size="md"
                fullWidth
              >
                {isVerified
                  ? "Sign In"
                  : resendCooldown > 0
                    ? `Resend in ${resendCooldown}s`
                    : "Resend Verification Email"}
              </AuthButton>
              {!isVerified && (
                <div className="text-center text-[10px] text-muted-foreground">
                  Verification links expire 1 hour after they're sent.
                </div>
              )}
            </div>
          )}

          {/* Back link for recovery / reset */}
          {(mode === "forgot" || mode === "reset") && (
            <AuthButton
              onClick={() => {
                setIsForgotPassword(false);
                setIsResettingPassword(false);
                setValidationErrors({});
                setFormError(null);
              }}
              disabled={isLoading}
              variant="secondary"
              size="sm"
              leftIcon={<ArrowLeft />}
              className="mt-4 sm:mt-5 self-center mx-auto text-xs"
            >
              Back to sign in
            </AuthButton>
          )}

          {/* Switch mode link */}
          {(mode === "signin" || mode === "signup") && (
            <p className="auth-switch mt-4 sm:mt-6 text-center text-xs text-muted-foreground">
              {mode === "signin" ? "Don't have an account? " : "Already have an account? "}
              <AuthButton
                variant="link"
                size="sm"
                onClick={() => switchToMode(mode === "signin" ? "signup" : "signin")}
                disabled={isLoading}
                data-testid="auth-mode-switch"
                className="text-xs font-semibold"
              >
                {mode === "signin" ? "Sign up" : "Sign in"}
              </AuthButton>
            </p>
          )}

        </div>
        </div>

        {/* Footer links */}
        <nav aria-label="Legal" className="auth-footer relative z-10 mt-4 sm:mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          <Link to="/terms-of-service" className="hover:text-foreground hover:underline underline-offset-4 transition-colors">
            Terms
          </Link>
          <span aria-hidden="true" className="opacity-40">·</span>
          <Link to="/privacy-policy" className="hover:text-foreground hover:underline underline-offset-4 transition-colors">
            Privacy
          </Link>
          <span aria-hidden="true" className="opacity-40">·</span>
          <a
            href="mailto:support@jet-around.com"
            className="hover:text-foreground hover:underline underline-offset-4 transition-colors"
          >
            Help
          </a>
        </nav>
        </div>
      </div>
      <AuthPWAInstallPromptWrapper ignoreRoute />
    </div>
  );
};

export default Auth;
