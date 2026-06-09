import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams, Link } from "react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff, Mail, Lock, ArrowLeft, AlertCircle, CheckCircle2 } from "lucide-react";
import { z } from "zod";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/contexts/AuthContext";
import { consumePostAuthRedirect } from "@/lib/postAuthRedirect";
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
  const [dataProcessingConsent, setDataProcessingConsent] = useState(false);
  const [locationConsent, setLocationConsent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const { user: authUser } = useAuth();

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
    (async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("onboarding_completed")
        .eq("id", authUser.id)
        .maybeSingle();
      if (cancelled) return;
      const target = profile?.onboarding_completed
        ? consumePostAuthRedirect("/")
        : "/onboarding";
      navigate(target, { replace: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [authUser, mode, navigate]);

  // Handle URL mode parameter (signin/signup)
  useEffect(() => {
    const mode = searchParams.get('mode');
    if (mode === 'signup') {
      setIsSignUp(true);
    } else if (mode === 'signin') {
      setIsSignUp(false);
    }
  }, [searchParams]);

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

  // Single-field validation for inline feedback
  const getFieldError = (field: FieldName): string | undefined => {
    if (field === "email") {
      const result = emailSchema.safeParse(email);
      return result.success ? undefined : result.error.errors[0].message;
    }
    if (field === "password") {
      if (mode === "signup" || mode === "reset") {
        const result = passwordSchema.safeParse(password);
        return result.success ? undefined : result.error.errors[0].message;
      }
      if (mode === "signin" && !password) {
        return "Password is required";
      }
      return undefined;
    }
    if (field === "confirmPassword") {
      if ((mode === "signup" || mode === "reset") && password !== confirmPassword) {
        return "Passwords do not match";
      }
      return undefined;
    }
    return undefined;
  };

  const validateInputs = (): boolean => {
    const errors: ValidationErrors = {};

    // Email is required in every mode except "reset" (no email field shown).
    if (mode !== "reset") {
      const emailErr = getFieldError("email");
      if (emailErr) errors.email = emailErr;
    }

    if (mode !== "forgot") {
      const pwErr = getFieldError("password");
      if (pwErr) errors.password = pwErr;

      const confirmErr = getFieldError("confirmPassword");
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
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
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
    } catch {
      toast.error("Google sign-in failed", {
        description: "Please try again or use email sign-in.",
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
    } catch {
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

      // Seed the consent center based on the boxes the user just ticked.
      // Location consent at signup unlocks both foreground and background
      // location tracking by default; users can revoke either one at any
      // time from Settings → Consent Center.
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
          description: "Please check your email and click the verification link.",
        });
        setShowResendVerification(true);
        return;
      }
      if (handleCommonAuthError(error)) return;
      throw error;
    }

    if (!data.user.email_confirmed_at) {
      await supabase.auth.signOut();
      toast.error("Email not verified", {
        description: "Please check your email and click the verification link before signing in.",
      });
      setShowResendVerification(true);
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarding_completed")
      .eq("id", data.user.id)
      .single();

    toast.success("Signed in successfully");
    navigate(
      profile?.onboarding_completed ? consumePostAuthRedirect("/") : "/onboarding",
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

  const eyebrow =
    mode === "reset"
      ? "New Password"
      : mode === "forgot"
      ? "Account Recovery"
      : mode === "signup"
      ? "Create Account"
      : "Welcome Back";

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

  const switchToMode = (next: "signin" | "signup") => {
    setIsSignUp(next === "signup");
    setIsForgotPassword(false);
    setShowResendVerification(false);
    setValidationErrors({});
    setPassword("");
    setConfirmPassword("");
    setDataProcessingConsent(false);
    setLocationConsent(false);
  };

  return (
    <div className="relative flex flex-1 min-h-0 w-full overflow-y-auto bg-background flex-col md:grid md:grid-cols-[2fr_3fr] lg:grid-cols-[1fr_1fr]">
      {/* LEFT / TOP — Brand panel */}
      <aside
        className="relative overflow-hidden bg-cover bg-center bg-no-repeat h-[200px] md:h-auto md:min-h-full"
        style={{ backgroundImage: `url(${authBackground})` }}
        aria-label="JET brand"
      >
        <div className="absolute inset-0 auth-gradient-overlay" />
        <div className="auth-mesh-bg" aria-hidden="true" />
        <div className="auth-pattern" aria-hidden="true" />
        <div className="auth-blob auth-blob-1" aria-hidden="true" />
        <div className="auth-blob auth-blob-2" aria-hidden="true" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-black/40 via-black/20 to-black/70" />

        <div className="relative z-10 flex h-full w-full flex-col justify-between p-6 md:p-10 lg:p-14">
          <div className="flex items-center gap-3">
            <img
              src={jetLogo}
              alt="JET"
              width="40"
              height="40"
              className="h-10 w-10 drop-shadow-[0_2px_12px_hsl(var(--primary)/0.5)]"
              fetchPriority="high"
              decoding="async"
            />
            <span className="font-display text-xl font-bold tracking-tight text-white drop-shadow-md">
              JET
            </span>
          </div>

          <div className="hidden md:flex flex-col gap-5 max-w-[440px]">
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-white/80 backdrop-blur-sm">
              <span className="dot-gold" />
              Charlotte, NC
            </span>
            <h2 className="font-display text-[32px] lg:text-[44px] leading-[1.05] font-bold tracking-tight text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.55)]">
              Discover what's hot. <span className="bg-gradient-to-r from-primary via-primary-glow to-gold bg-clip-text text-transparent">Right now.</span>
            </h2>
            <p className="text-base text-white/85 leading-relaxed max-w-[400px] drop-shadow">
              Live deals, real crowds, and the city's pulse — all in one place. Made for the nights you'll actually remember.
            </p>
            <figure className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-md">
              <blockquote className="text-sm leading-relaxed text-white/90">
                "JET became my Friday-night ritual. I haven't paid full price for a cocktail in months."
              </blockquote>
              <figcaption className="mt-3 text-xs uppercase tracking-wider text-white/60">
                — Maya R. · JET+ member
              </figcaption>
            </figure>
          </div>

          <div className="hidden md:block text-[11px] uppercase tracking-[0.2em] text-white/50">
            © {new Date().getFullYear()} JET Around
          </div>
        </div>

        {/* Mobile-only brand headline overlay */}
        <div className="md:hidden absolute inset-0 z-10 flex items-end p-5">
          <h2 className="font-display text-2xl font-bold leading-tight text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)]">
            Discover what's hot.<br />
            <span className="bg-gradient-to-r from-primary-glow to-gold bg-clip-text text-transparent">Right now.</span>
          </h2>
        </div>
      </aside>

      {/* RIGHT / BOTTOM — Form panel */}
      <div className="relative flex flex-1 flex-col items-center justify-center px-fluid-sm sm:px-12 lg:px-[48px] pt-[max(env(safe-area-inset-top,0px),var(--space-lg))] pb-[max(env(safe-area-inset-bottom,0px),var(--space-lg))]">
        <div className="w-full max-w-[380px] flex flex-col items-center animate-fade-in">
        {/* Logo above card — 48px */}
        <div className="relative mb-2">
          <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,hsl(var(--primary)/0.35)_0%,transparent_70%)] blur-md" />
          <img
            src={jetLogo}
            alt="JET"
            className="auth-card-logo relative"
            width="48"
            height="48"
            fetchPriority="high"
            decoding="async"
          />
        </div>

        {/* Centered Card */}
        <div className={`auth-card ${shake ? "auth-shake" : ""}`}>
          <div key={mode} className="auth-crossfade">
          {/* Eyebrow + title */}
          <div className="flex flex-col items-center gap-2 text-center mb-5">
            <div className="flex items-center gap-2">
              <span className="dot-gold" />
              <span className="heading-luxe-eyebrow">{eyebrow}</span>
              <span className="dot-gold" />
            </div>
            <h1 className="heading-luxe-gradient text-[26px] sm:text-[28px] leading-tight m-0">
              {mode === "signup" ? "Join JET" : mode === "forgot" ? "Reset Password" : mode === "reset" ? "New Password" : "Welcome Back"}
            </h1>
            <p className="text-fluid-sm text-muted-foreground max-w-[320px] mt-1">
              {subtitle}
            </p>
          </div>

          {/* Segmented mode switcher */}
          {mode !== "reset" && mode !== "forgot" && (
            <div
              role="tablist"
              aria-label="Authentication mode"
              className="relative grid grid-cols-2 gap-1 rounded-full border-hairline bg-card/40 p-1 backdrop-blur-sm mb-5"
            >
              <button
                type="button"
                role="tab"
                aria-selected={mode === "signin"}
                onClick={() => switchToMode("signin")}
                disabled={isLoading}
                className={`min-h-10 rounded-full text-fluid-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                  mode === "signin"
                    ? "bg-gradient-to-r from-primary to-primary-glow text-primary-foreground shadow-md"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "signup"}
                onClick={() => switchToMode("signup")}
                disabled={isLoading}
                className={`min-h-10 rounded-full text-fluid-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                  mode === "signup"
                    ? "bg-gradient-to-r from-primary to-primary-glow text-primary-foreground shadow-md"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Sign Up
              </button>
            </div>
          )}

          {/* Form (relative so the loading overlay positions correctly) */}
          <form
            onSubmit={handleSubmit}
            className="relative flex flex-col gap-4"
            aria-busy={isLoading}
          >
            {isLoading && (
              <div className="auth-loading-overlay" aria-hidden="true">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            )}

            {/* Email field */}
            {!isResettingPassword && (
              <div className="flex flex-col gap-1.5">
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
                    onBlur={() => handleBlur("email")}
                    required
                    disabled={isLoading}
                    className={`auth-input pl-11 ${validationErrors.email ? "border-destructive" : ""}`}
                    autoComplete="email"
                  />
                </div>
                {validationErrors.email && (
                  <p className="inline-flex items-center gap-1.5 text-xs text-destructive mt-0.5">
                    <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                    {validationErrors.email}
                  </p>
                )}
              </div>
            )}

            {/* Password */}
            {!isForgotPassword && (
              <>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold uppercase tracking-wider text-foreground/80" htmlFor="auth-password">
                      Password
                    </label>
                    {mode === "signin" && (
                      <button
                        type="button"
                        onClick={() => setIsForgotPassword(true)}
                        disabled={isLoading}
                        className="text-xs font-medium text-primary hover:text-primary-glow transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded"
                      >
                        Forgot?
                      </button>
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
                      onBlur={() => handleBlur("password")}
                      required
                      disabled={isLoading}
                      className={`auth-input pl-11 pr-12 ${validationErrors.password ? "border-destructive" : ""}`}
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
                    <p className="inline-flex items-center gap-1.5 text-xs text-destructive mt-0.5">
                      <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                      {validationErrors.password}
                    </p>
                  ) : (isSignUp || isResettingPassword) ? (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      8+ characters with uppercase, lowercase, and number
                    </p>
                  ) : null}
                </div>

                {(isSignUp || isResettingPassword) && (
                  <div className="flex flex-col gap-1.5">
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
                        onBlur={() => handleBlur("confirmPassword")}
                        required
                        disabled={isLoading}
                        className={`auth-input pl-11 pr-12 ${validationErrors.confirmPassword ? "border-destructive" : ""}`}
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
                      <p className="inline-flex items-center gap-1.5 text-xs text-destructive mt-0.5">
                        <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                        {validationErrors.confirmPassword}
                      </p>
                    )}
                  </div>
                )}

                {/* Signup consent */}
                {isSignUp && (
                  <div className="flex flex-col gap-3 pt-1">
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
                        <span className="text-destructive ml-0.5">*</span>
                      </label>
                    </div>
                    {validationErrors.consent && (
                      <p className="ml-6 inline-flex items-center gap-1.5 text-xs text-destructive">
                        <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
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
                        <span className="text-destructive ml-0.5">*</span>
                      </label>
                    </div>
                    {validationErrors.locationConsent && (
                      <p className="ml-6 inline-flex items-center gap-1.5 text-xs text-destructive">
                        <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
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
                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span className="leading-snug">{formError}</span>
              </div>
            )}
            {successMessage && (
              <div
                role="status"
                className="flex items-start gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5 text-xs text-emerald-400"
              >
                <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span className="leading-snug">{successMessage}</span>
              </div>
            )}

            <Button
              type="submit"
              disabled={isLoading}
              variant="jet"
              size="lg"
              className="mt-1 w-full rounded-full text-fluid-base font-semibold tracking-wide shadow-lg shadow-primary/20"
              style={{ height: 48, minHeight: 48 }}
            >
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                primaryLabel
              )}
            </Button>
          </form>

          {/* Social section */}
          {(mode === "signin" || mode === "signup") && (
            <>
              <div className="flex items-center gap-3 my-5">
                <div className="h-px flex-1 bg-border/40" />
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground">or continue with</span>
                <div className="h-px flex-1 bg-border/40" />
              </div>
              <Button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isLoading}
                variant="outline"
                size="lg"
                className="w-full rounded-full border-border/60 bg-card/40 text-foreground backdrop-blur-sm transition-all hover:border-primary/50 hover:bg-primary/10 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/50"
                style={{ height: 48, minHeight: 48 }}
              >
                {isLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" fill="#4285F4" />
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                    </svg>
                    Continue with Google
                  </>
                )}
              </Button>
            </>
          )}

          {/* Resend Verification */}
          {showResendVerification && !isResettingPassword && (
            <div className="mt-5 flex flex-col gap-2 rounded-xl border border-primary/25 bg-card/40 p-4 backdrop-blur-md">
              <div className="text-center text-xs text-muted-foreground">
                Didn't receive the verification email?
              </div>
              <Button
                type="button"
                onClick={handleResendVerification}
                disabled={isResending || resendCooldown > 0}
                variant="outline"
                size="sm"
                className="w-full rounded-full border-primary/40 bg-transparent text-foreground hover:border-primary/70 hover:bg-primary/10 hover:text-primary disabled:opacity-60"
              >
                {isResending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend Verification Email"}
              </Button>
            </div>
          )}

          {/* Back link for recovery / reset */}
          {(mode === "forgot" || mode === "reset") && (
            <button
              type="button"
              onClick={() => {
                setIsForgotPassword(false);
                setIsResettingPassword(false);
                setValidationErrors({});
                setFormError(null);
              }}
              disabled={isLoading}
              className="mt-5 inline-flex items-center justify-center gap-2 self-center rounded-full border border-border/40 bg-card/30 px-4 py-2 text-xs font-medium text-foreground/90 hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-50 mx-auto"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to sign in
            </button>
          )}

          {/* "Don't have an account?" footer toggle */}
          {(mode === "signin" || mode === "signup") && (
            <p className="mt-6 text-center text-xs text-muted-foreground">
              {mode === "signin" ? "Don't have an account?" : "Already have an account?"}{" "}
              <button
                type="button"
                onClick={() => switchToMode(mode === "signin" ? "signup" : "signin")}
                disabled={isLoading}
                className="font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded"
              >
                {mode === "signin" ? "Sign up" : "Sign in"}
              </button>
            </p>
          )}
        </div>
        </div>

        {/* Footer links */}
        <nav aria-label="Legal" className="relative z-10 mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
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
    </div>
  );
};

export default Auth;
