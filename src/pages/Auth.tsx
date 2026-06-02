import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff, Mail, Lock, ArrowLeft } from "lucide-react";
import { z } from "zod";
// Use the new JET logo for auth page
import jetLogo from "@/assets/jet-auth-logo.png";
import authBackground from "@/assets/auth-background.webp";
import { AuthPWAInstallPromptWrapper } from "@/components/AuthPWAInstallPromptWrapper";

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
  const [validationErrors, setValidationErrors] = useState<{ email?: string; password?: string; confirmPassword?: string; consent?: string; locationConsent?: string }>({});
  const [showResendVerification, setShowResendVerification] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [isResending, setIsResending] = useState(false);
  const [dataProcessingConsent, setDataProcessingConsent] = useState(false);
  const [locationConsent, setLocationConsent] = useState(false);

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

  // Validate inputs before submission
  const validateInputs = (): boolean => {
    const errors: { email?: string; password?: string; confirmPassword?: string; consent?: string; locationConsent?: string } = {};
    
    // Validate email
    const emailResult = emailSchema.safeParse(email);
    if (!emailResult.success) {
      errors.email = emailResult.error.errors[0].message;
    }
    
    // Validate password - strict validation ONLY for signup, basic check for signin
    if (!isForgotPassword) {
      if (isSignUp || isResettingPassword) {
        // Strict password validation for new passwords
        const passwordResult = passwordSchema.safeParse(password);
        if (!passwordResult.success) {
          errors.password = passwordResult.error.errors[0].message;
        }
      } else {
        // For signin, only check that password is not empty (min length 1)
        if (!password || password.length === 0) {
          errors.password = "Password is required";
        }
      }
      
      // Validate password confirmation for signup and password reset
      if ((isSignUp || isResettingPassword) && password !== confirmPassword) {
        errors.confirmPassword = "Passwords do not match";
      }
      
      // Validate consent for signup only
      if (isSignUp && !dataProcessingConsent) {
        errors.consent = "You must agree to the Privacy Policy and Terms of Service";
      }
      
      // Validate location consent for signup only
      if (isSignUp && !locationConsent) {
        errors.locationConsent = "Location consent is required to receive personalized deals";
      }
    }
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
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
        options: {
          emailRedirectTo: window.location.origin.includes('localhost') 
            ? 'https://jet-around.com/verification-success'
            : `${window.location.origin}/verification-success`,
        },
      });

      if (error) {
        if (error.message?.includes("rate limit")) {
          toast.error("Too many attempts", {
            description: "Please wait a few minutes before trying again.",
          });
          setResendCooldown(60);
        } else {
          throw error;
        }
        return;
      }

      toast.success("Verification email sent!", {
        description: "Please check your inbox and spam folder.",
      });
      setResendCooldown(60); // 60 second cooldown
    } catch (error: any) {
      toast.error("Failed to resend email", {
        description: "Please try again or contact support if the issue persists.",
      });
    } finally {
      setIsResending(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setValidationErrors({});

    try {
      // Validate email
      const emailResult = emailSchema.safeParse(email);
      if (!emailResult.success) {
        setValidationErrors({ email: emailResult.error.errors[0].message });
        return;
      }

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth?reset=true`,
      });

      if (error) throw error;

      toast.success("Password reset email sent", {
        description: "Check your email for the password reset link.",
      });
      setEmail("");
      setIsForgotPassword(false);
    } catch (error: any) {
      // Enhanced error handling
      if (error.message?.includes("rate limit")) {
        toast.error("Too many requests", {
          description: "Please wait a few minutes before trying again.",
        });
      } else {
        toast.error("Error sending reset email", {
          description: "Please check your email and try again.",
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setValidationErrors({});

    try {
      // Validate password
      const passwordResult = passwordSchema.safeParse(password);
      if (!passwordResult.success) {
        setValidationErrors({ password: passwordResult.error.errors[0].message });
        return;
      }

      // Validate password confirmation
      if (password !== confirmPassword) {
        setValidationErrors({ confirmPassword: "Passwords do not match" });
        return;
      }

      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) throw error;

      toast.success("Password updated successfully", {
        description: "You can now sign in with your new password.",
      });
      
      // Clear the form and redirect to sign in
      setPassword("");
      setConfirmPassword("");
      setIsResettingPassword(false);
      navigate("/auth");
    } catch (error: any) {
      toast.error("Error updating password", {
        description: "Please try again or request a new reset link.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationErrors({});
    
    // Validate inputs
    if (!validateInputs()) {
      return;
    }
    
    setIsLoading(true);

    try {
      if (isSignUp) {
        // Use production URL, never localhost
        const appUrl = window.location.origin.includes('localhost') 
          ? 'https://jet-around.com'
          : window.location.origin;
        
        const { data: signUpData, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: `${appUrl}/verification-success`,
          },
        });

        // Enhanced error handling for signup
        if (error) {
          const msg = error.message?.toLowerCase() ?? "";
          if (
            msg.includes("already registered") ||
            msg.includes("already been registered") ||
            msg.includes("user already exists")
          ) {
            toast.error("Account already exists", {
              description: "This email is already registered. Please sign in instead.",
            });
            setIsSignUp(false);
            setPassword("");
            setConfirmPassword("");
            return;
          } else if (msg.includes("rate limit")) {
            toast.error("Too many attempts", {
              description: "Please wait a few minutes before trying again.",
            });
            return;
          }
          throw error;
        }

        // Supabase returns a user with empty identities when the email is
        // already registered (no error thrown). Detect and surface clearly
        // instead of silently "succeeding".
        const identities = (signUpData.user as any)?.identities;
        if (signUpData.user && Array.isArray(identities) && identities.length === 0) {
          toast.error("Account already exists", {
            description: "This email is already registered. Please sign in instead.",
          });
          setIsSignUp(false);
          setPassword("");
          setConfirmPassword("");
          setDataProcessingConsent(false);
          setLocationConsent(false);
          return;
        }

        // Store consent in profile after signup
        if (signUpData.user) {
          await supabase.from("profiles").update({
            data_processing_consent: dataProcessingConsent,
            data_processing_consent_date: new Date().toISOString(),
            location_consent_given: locationConsent,
            location_consent_date: locationConsent ? new Date().toISOString() : null,
          }).eq("id", signUpData.user.id);
        }

        toast.success("Check your email!", {
          description:
            "We sent you a verification link. If it doesn't arrive in a minute, tap \"Resend verification email\" below.",
          duration: 8000,
        });
        // Store email for auto-fill on verification-success page
        localStorage.setItem("jet_verification_email", email.trim().toLowerCase());
        setShowResendVerification(true);
        setPassword("");
        setConfirmPassword("");
        setDataProcessingConsent(false);
        setLocationConsent(false);
        return;
      } else {
        const { error, data } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        // Enhanced error handling for signin
        if (error) {
          if (error.message?.includes("Invalid login credentials")) {
            toast.error("Invalid credentials", {
              description: "The email or password you entered is incorrect.",
            });
            return;
          } else if (error.message?.includes("Email not confirmed")) {
            toast.error("Email not verified", {
              description: "Please check your email and click the verification link.",
            });
            setShowResendVerification(true);
            return;
          } else if (error.message?.includes("rate limit")) {
            toast.error("Too many attempts", {
              description: "Please wait a few minutes before trying again.",
            });
            return;
          }
          throw error;
        }

        // Check if email is verified
        if (!data.user.email_confirmed_at) {
          await supabase.auth.signOut();
          toast.error("Email not verified", {
            description: "Please check your email and click the verification link before signing in.",
          });
          setShowResendVerification(true);
          setIsLoading(false);
          return;
        }

        // Check if onboarding is completed
        const { data: profile } = await supabase
          .from("profiles")
          .select("onboarding_completed")
          .eq("id", data.user.id)
          .single();

        toast.success("Signed in successfully");
        
        if (!profile?.onboarding_completed) {
          navigate("/onboarding");
          return;
        }
      }

      navigate("/");
    } catch (error: any) {
      // Generic error fallback (don't log sensitive data)
      toast.error("Authentication error", {
        description: "An unexpected error occurred. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const mode: "signin" | "signup" | "forgot" | "reset" = isResettingPassword
    ? "reset"
    : isForgotPassword
    ? "forgot"
    : isSignUp
    ? "signup"
    : "signin";

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
    <div
      className="relative flex flex-1 min-h-0 w-full items-center justify-center overflow-y-auto bg-background bg-cover bg-center bg-no-repeat px-fluid-md pt-[max(env(safe-area-inset-top,0px),var(--space-lg))] pb-[max(env(safe-area-inset-bottom,0px),var(--space-lg))]"
      style={{ backgroundImage: `url(${authBackground})` }}
    >
      {/* Animated matte black/grey gradient overlay */}
      <div className="absolute inset-0 auth-gradient-overlay" />
      {/* Editorial vignette — keeps focus on the card */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,hsl(0_0%_0%/0.55)_100%)]" />

      <div className="relative z-10 mx-auto w-full max-w-[420px] sm:max-w-md">
        {/* Glassmorphic Card */}
        <div className="flex flex-col gap-fluid-md sm:gap-fluid-lg rounded-3xl border-hairline bg-background/30 p-fluid-md sm:p-fluid-lg backdrop-blur-2xl glow-ambient">
          {/* Header */}
          <div className="flex flex-col items-center gap-fluid-xs sm:gap-fluid-sm text-center">
            <div className="relative flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,hsl(var(--primary)/0.25)_0%,transparent_70%)] blur-md" />
              <img
                src={jetLogo}
                alt="JET Logo"
                className="relative h-full w-full object-contain drop-shadow-[0_4px_20px_hsl(var(--primary)/0.35)]"
                width="80"
                height="80"
                fetchPriority="high"
                decoding="async"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="dot-gold" />
              <span className="heading-luxe-eyebrow">{eyebrow}</span>
              <span className="dot-gold" />
            </div>
            <h1 className="heading-luxe-gradient">
              {mode === "signup" ? "Join JET" : "Welcome to JET"}
            </h1>
            <div className="divider-luxe mx-auto" style={{ maxWidth: "72px" }} />
            <p className="max-w-xs text-fluid-sm text-muted-foreground">
              {subtitle}
            </p>
          </div>

          {/* Segmented mode switcher — only for primary auth states */}
          {mode !== "reset" && mode !== "forgot" && (
            <div
              role="tablist"
              aria-label="Authentication mode"
              className="relative grid grid-cols-2 gap-1 rounded-full border-hairline bg-card/40 p-1 backdrop-blur-sm"
            >
              <button
                type="button"
                role="tab"
                aria-selected={mode === "signin"}
                onClick={() => switchToMode("signin")}
                disabled={isLoading}
                className={`min-h-[40px] rounded-full text-fluid-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
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
                className={`min-h-[40px] rounded-full text-fluid-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                  mode === "signup"
                    ? "bg-gradient-to-r from-primary to-primary-glow text-primary-foreground shadow-md"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Sign Up
              </button>
            </div>
          )}

          {/* Form */}
          <form
            onSubmit={
              isResettingPassword
                ? handlePasswordReset
                : isForgotPassword
                ? handleForgotPassword
                : handleAuth
            }
            className="flex flex-col gap-fluid-md"
          >
            {/* Email field - only show if not resetting password */}
            {!isResettingPassword && (
              <div className="flex flex-col gap-fluid-xs">
                <label className="heading-luxe-eyebrow text-left" htmlFor="auth-email">
                  Email
                </label>
                <div className="relative">
                  <Mail
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    id="auth-email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setValidationErrors((prev) => ({ ...prev, email: undefined }));
                    }}
                    required
                    className={`pl-10 ${
                      validationErrors.email ? "border-destructive" : ""
                    }`}
                    autoComplete="email"
                  />
                </div>
                {validationErrors.email && (
                  <p className="text-fluid-xs text-destructive">{validationErrors.email}</p>
                )}
              </div>
            )}

            {/* Password fields */}
            {!isForgotPassword && (
              <>
                <div className="flex flex-col gap-fluid-xs">
                  <label className="heading-luxe-eyebrow text-left" htmlFor="auth-password">
                    Password
                  </label>
                  <div className="relative">
                    <Lock
                      aria-hidden="true"
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    />
                    <Input
                      id="auth-password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setValidationErrors((prev) => ({
                          ...prev,
                          password: undefined,
                        }));
                      }}
                      required
                      className={`pl-10 pr-12 ${
                        validationErrors.password ? "border-destructive" : ""
                      }`}
                      autoComplete={isSignUp ? "new-password" : "current-password"}
                    />
                    <IconButton
                      onClick={() => setShowPassword(!showPassword)}
                      ariaLabel={showPassword ? "Hide password" : "Show password"}
                      ariaPressed={showPassword}
                      className="absolute right-1 top-1/2 -translate-y-1/2"
                    >
                      {showPassword ? (
                        <EyeOff />
                      ) : (
                        <Eye />
                      )}
                    </IconButton>
                  </div>
                  {validationErrors.password && (
                    <p className="text-fluid-xs text-destructive">
                      {validationErrors.password}
                    </p>
                  )}
                  {(isSignUp || isResettingPassword) && !validationErrors.password && (
                    <p className="text-fluid-xs text-muted-foreground">
                      Must be 8+ characters with uppercase, lowercase, and number
                    </p>
                  )}
                </div>

                {(isSignUp || isResettingPassword) && (
                  <div className="flex flex-col gap-fluid-xs">
                    <label className="heading-luxe-eyebrow text-left" htmlFor="auth-confirm-password">
                      Confirm Password
                    </label>
                    <div className="relative">
                      <Lock
                        aria-hidden="true"
                        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                      />
                      <Input
                        id="auth-confirm-password"
                        type={showConfirmPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={confirmPassword}
                        onChange={(e) => {
                          setConfirmPassword(e.target.value);
                          setValidationErrors((prev) => ({
                            ...prev,
                            confirmPassword: undefined,
                          }));
                        }}
                        required
                        className={`pl-10 pr-12 ${
                          validationErrors.confirmPassword
                            ? "border-destructive"
                            : ""
                        }`}
                        autoComplete="new-password"
                      />
                      <IconButton
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        ariaLabel={showConfirmPassword ? "Hide password" : "Show password"}
                        ariaPressed={showConfirmPassword}
                        className="absolute right-1 top-1/2 -translate-y-1/2"
                      >
                        {showConfirmPassword ? (
                          <EyeOff />
                        ) : (
                          <Eye />
                        )}
                      </IconButton>
                    </div>
                    {validationErrors.confirmPassword && (
                      <p className="text-fluid-xs text-destructive">
                        {validationErrors.confirmPassword}
                      </p>
                    )}
                  </div>
                )}

                {/* Consent checkboxes for signup */}
                {isSignUp && (
                  <div className="flex flex-col gap-fluid-sm pt-fluid-xs">
                    <div className="flex items-start gap-fluid-sm">
                      <Checkbox
                        id="dataConsent"
                        checked={dataProcessingConsent}
                        onCheckedChange={(checked) => {
                          setDataProcessingConsent(checked === true);
                          setValidationErrors((prev) => ({
                            ...prev,
                            consent: undefined,
                          }));
                        }}
                        className="mt-0.5"
                      />
                      <label
                        htmlFor="dataConsent"
                        className="cursor-pointer text-fluid-sm leading-relaxed text-foreground/85"
                      >
                        I agree to the{" "}
                        <Link
                          to="/privacy-policy"
                          target="_blank"
                          className="font-medium text-primary underline-offset-4 transition-colors hover:text-primary-glow hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                        >
                          Privacy Policy
                        </Link>{" "}
                        and{" "}
                        <Link
                          to="/terms-of-service"
                          target="_blank"
                          className="font-medium text-primary underline-offset-4 transition-colors hover:text-primary-glow hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                        >
                          Terms of Service
                        </Link>
                        . I understand my data will be processed securely after
                        inactivity.
                        <span className="text-destructive">*</span>
                      </label>
                    </div>
                    {validationErrors.consent && (
                      <p className="ml-6 text-fluid-xs text-destructive">
                        {validationErrors.consent}
                      </p>
                    )}

                    <div className="flex items-start gap-fluid-sm">
                      <Checkbox
                        id="locationConsent"
                        checked={locationConsent}
                        onCheckedChange={(checked) => {
                          setLocationConsent(checked === true);
                          setValidationErrors((prev) => ({
                            ...prev,
                            locationConsent: undefined,
                          }));
                        }}
                        className="mt-0.5"
                      />
                      <label
                        htmlFor="locationConsent"
                        className="cursor-pointer text-fluid-sm leading-relaxed text-foreground/85"
                      >
                        I consent to location tracking to receive personalized
                        deals and push notifications. You can disable this
                        anytime in your Profile Settings.
                        <span className="text-destructive">*</span>
                      </label>
                    </div>
                    {validationErrors.locationConsent && (
                      <p className="ml-6 text-fluid-xs text-destructive">
                        {validationErrors.locationConsent}
                      </p>
                    )}
                  </div>
                )}
              </>
            )}

          <Button
            type="submit"
            disabled={isLoading}
            variant="jet"
            size="lg"
            className="mt-fluid-xs w-full rounded-full text-fluid-base font-semibold tracking-wide shadow-lg shadow-primary/20"
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              primaryLabel
            )}
          </Button>
          </form>
  
          {/* Resend Verification Email */}
          {showResendVerification && !isResettingPassword && (
            <div className="flex flex-col gap-fluid-sm rounded-xl border border-primary/25 bg-card/40 p-fluid-md backdrop-blur-md">
              <div className="text-center text-fluid-sm text-muted-foreground">
                Didn't receive the verification email?
              </div>
              <Button
                type="button"
                onClick={handleResendVerification}
                disabled={isResending || resendCooldown > 0}
                variant="outline"
                size="sm"
                className="w-full rounded-full border-primary/40 bg-transparent text-foreground transition-all hover:border-primary/70 hover:bg-primary/10 hover:text-primary focus-visible:border-primary/70 focus-visible:ring-2 focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:border-border/40 disabled:bg-transparent disabled:text-muted-foreground disabled:opacity-60"
              >
                {isResending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {resendCooldown > 0
                  ? `Resend in ${resendCooldown}s`
                  : "Resend Verification Email"}
              </Button>
            </div>
          )}
  
          {/* Forgot password link — signin only */}
          {mode === "signin" && (
            <div className="-mt-fluid-sm flex justify-end">
              <button
                type="button"
                onClick={() => setIsForgotPassword(true)}
                disabled={isLoading}
                className="rounded-full px-3 py-1.5 text-fluid-sm font-medium text-foreground/80 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:pointer-events-none disabled:opacity-50"
              >
                Forgot password?
              </button>
            </div>
          )}

          {/* Back link for recovery / reset flows */}
          {(mode === "forgot" || mode === "reset") && (
            <button
              type="button"
              onClick={() => {
                setIsForgotPassword(false);
                setIsResettingPassword(false);
                setValidationErrors({});
              }}
              disabled={isLoading}
              className="inline-flex items-center justify-center gap-2 self-center rounded-full border border-border/40 bg-card/30 px-4 py-2 text-fluid-sm font-medium text-foreground/90 transition-colors hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:pointer-events-none disabled:opacity-50"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to sign in
            </button>
          )}

          {/* Features — signup only, dot-gold bullets */}
          {mode === "signup" && (
            <div className="flex flex-col gap-fluid-sm rounded-xl border-hairline bg-card/30 p-fluid-md backdrop-blur-sm">
              <p className="heading-luxe-eyebrow">Member Benefits</p>
              <ul className="flex list-none flex-col gap-fluid-xs p-0 text-fluid-xs text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="dot-gold mt-1.5 shrink-0" />
                  Real-time alerts for nearby deals
                </li>
                <li className="flex items-start gap-2">
                  <span className="dot-gold mt-1.5 shrink-0" />
                  Save and revisit your favorite venues
                </li>
                <li className="flex items-start gap-2">
                  <span className="dot-gold mt-1.5 shrink-0" />
                  Personalized recommendations
                </li>
                <li className="flex items-start gap-2">
                  <span className="dot-gold mt-1.5 shrink-0" />
                  Track your activity and rewards
                </li>
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Footer now rendered globally */}
      <AuthPWAInstallPromptWrapper />
    </div>
  );
};

export default Auth;
