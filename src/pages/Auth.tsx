import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { z } from "zod";
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
          description: "We sent you a verification link. Please verify your email to continue.",
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

  return (
    <div
      className="relative flex min-h-screen min-h-[100dvh] items-center justify-center bg-background bg-cover bg-center bg-no-repeat px-fluid-md py-fluid-lg"
      style={{
        backgroundImage: `url(${authBackground})`,
        paddingTop: "max(env(safe-area-inset-top, 0px), var(--space-lg))",
        paddingBottom: "max(env(safe-area-inset-bottom, 0px), var(--space-lg))",
      }}
    >
      {/* Animated matte black/grey gradient overlay */}
      <div className="absolute inset-0 auth-gradient-overlay" />

      <div className="relative z-10 w-full max-w-md">
        {/* Glassmorphic Card */}
        <div className="flex flex-col gap-6 rounded-2xl border border-border/30 bg-background/20 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
          {/* Header */}
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex h-24 w-24 items-center justify-center">
              <img
                src={jetLogo}
                alt="JET Logo"
                className="h-full w-full object-contain drop-shadow-lg"
                width="96"
                height="96"
                fetchPriority="high"
                decoding="async"
              />
            </div>
            <h1 className="bg-gradient-to-r from-foreground to-primary bg-clip-text text-2xl font-extrabold text-transparent sm:text-3xl">
              Welcome to JET
            </h1>
            <p className="text-sm text-muted-foreground">
              {isResettingPassword
                ? "Set your new password"
                : isForgotPassword
                ? "Reset your password"
                : isSignUp
                ? "Join JET and find what's hot near you"
                : "Sign in to discover what's hot in your area"}
            </p>
          </div>

          {/* Form */}
          <form
            onSubmit={
              isResettingPassword
                ? handlePasswordReset
                : isForgotPassword
                ? handleForgotPassword
                : handleAuth
            }
            className="flex flex-col gap-4"
          >
            {/* Email field - only show if not resetting password */}
            {!isResettingPassword && (
              <div className="flex flex-col gap-2">
                <Input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setValidationErrors((prev) => ({ ...prev, email: undefined }));
                  }}
                  required
                  className={`bg-card border-border ${
                    validationErrors.email ? "border-destructive" : ""
                  }`}
                  autoComplete="email"
                />
                {validationErrors.email && (
                  <p className="text-xs text-destructive">{validationErrors.email}</p>
                )}
              </div>
            )}

            {/* Password fields */}
            {!isForgotPassword && (
              <>
                <div className="flex flex-col gap-2">
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="Password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setValidationErrors((prev) => ({
                          ...prev,
                          password: undefined,
                        }));
                      }}
                      required
                      className={`bg-card border-border pr-12 ${
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
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </IconButton>
                  </div>
                  {validationErrors.password && (
                    <p className="text-xs text-destructive">
                      {validationErrors.password}
                    </p>
                  )}
                  {(isSignUp || isResettingPassword) && !validationErrors.password && (
                    <p className="text-xs text-muted-foreground">
                      Must be 8+ characters with uppercase, lowercase, and number
                    </p>
                  )}
                </div>

                {(isSignUp || isResettingPassword) && (
                  <div className="flex flex-col gap-2">
                    <div className="relative">
                      <Input
                        type={showConfirmPassword ? "text" : "password"}
                        placeholder="Confirm Password"
                        value={confirmPassword}
                        onChange={(e) => {
                          setConfirmPassword(e.target.value);
                          setValidationErrors((prev) => ({
                            ...prev,
                            confirmPassword: undefined,
                          }));
                        }}
                        required
                        className={`bg-card border-border pr-12 ${
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
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </IconButton>
                    </div>
                    {validationErrors.confirmPassword && (
                      <p className="text-xs text-destructive">
                        {validationErrors.confirmPassword}
                      </p>
                    )}
                  </div>
                )}

                {/* Consent checkboxes for signup */}
                {isSignUp && (
                  <div className="flex flex-col gap-3 pt-2">
                    <div className="flex items-start gap-3">
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
                        className="cursor-pointer text-xs leading-relaxed text-muted-foreground"
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
                      <p className="ml-6 text-xs text-destructive">
                        {validationErrors.consent}
                      </p>
                    )}

                    <div className="flex items-start gap-3">
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
                        className="cursor-pointer text-xs leading-relaxed text-muted-foreground"
                      >
                        I consent to location tracking to receive personalized
                        deals and push notifications. You can disable this
                        anytime in your Profile Settings.
                        <span className="text-destructive">*</span>
                      </label>
                    </div>
                    {validationErrors.locationConsent && (
                      <p className="ml-6 text-xs text-destructive">
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
            className="w-full rounded-xl text-base"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : isResettingPassword ? (
              "Update Password"
            ) : isForgotPassword ? (
              "Send Reset Link"
            ) : isSignUp ? (
              "Sign Up"
            ) : (
              "Sign In"
            )}
          </Button>
        </form>

        {/* Resend Verification Email */}
        {showResendVerification && !isResettingPassword && (
          <div className="flex flex-col gap-3 rounded-xl border border-primary/25 bg-card/40 p-4 backdrop-blur-md">
            <div className="text-center text-sm text-muted-foreground">
              Didn't receive the verification email?
            </div>
            <Button
              type="button"
              onClick={handleResendVerification}
              disabled={isResending || resendCooldown > 0}
              variant="outline"
              size="sm"
              className="w-full rounded-xl border-primary/40 bg-transparent text-foreground transition-all hover:border-primary/70 hover:bg-primary/10 hover:text-primary focus-visible:border-primary/70 focus-visible:ring-2 focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:border-border/40 disabled:bg-transparent disabled:text-muted-foreground disabled:opacity-60"
            >
              {isResending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {resendCooldown > 0
                ? `Resend in ${resendCooldown}s`
                : "Resend Verification Email"}
            </Button>
          </div>
        )}

        {/* Toggle & Forgot Password */}
        {!isResettingPassword && (
          <div className="flex flex-col gap-1 text-center">
            {!isForgotPassword && !isSignUp && (
              <button
                type="button"
                onClick={() => setIsForgotPassword(true)}
                disabled={isLoading}
                className="flex min-h-[44px] w-full touch-manipulation items-center justify-center rounded-lg border border-transparent bg-transparent text-sm font-medium text-muted-foreground transition-colors hover:border-primary/20 hover:bg-primary/10 hover:text-primary active:text-primary-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:text-primary disabled:pointer-events-none disabled:opacity-50"
              >
                Forgot password?
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setIsForgotPassword(false);
                setShowResendVerification(false);
                setValidationErrors({});
                setPassword("");
                setConfirmPassword("");
                setDataProcessingConsent(false);
                setLocationConsent(false);
              }}
              disabled={isLoading}
              className="flex min-h-[44px] w-full touch-manipulation items-center justify-center rounded-lg border border-transparent bg-transparent text-sm text-muted-foreground transition-colors hover:border-primary/20 hover:bg-primary/10 hover:text-primary active:text-primary-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:text-primary disabled:pointer-events-none disabled:opacity-50"
            >
              {isForgotPassword ? (
                "Back to sign in"
              ) : isSignUp ? (
                <>
                  Already have an account?{" "}
                  <span className="ml-1 font-semibold text-primary">Sign in</span>
                </>
              ) : (
                <>
                  Don't have an account?{" "}
                  <span className="ml-1 font-semibold text-primary">Sign up</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Features */}
        <div className="flex flex-col gap-2 rounded-xl border border-border/30 bg-card/30 p-4 backdrop-blur-sm">
          <p className="text-xs font-semibold text-foreground">
            With an account you can:
          </p>
          <ul className="flex list-none flex-col gap-1 p-0 text-xs text-muted-foreground">
            <li>• Get real-time notifications for nearby deals</li>
            <li>• Save your favorite venues</li>
            <li>• Receive personalized recommendations</li>
            <li>• Track your activity and rewards</li>
          </ul>
        </div>
        </div>
      </div>

      {/* Footer now rendered globally */}
    </div>
  );
};

export default Auth;
