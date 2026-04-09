import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { z } from "zod";
// Footer is now rendered globally in App.tsx
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
          if (error.message?.includes("already registered")) {
            toast.error("Account already exists", {
              description: "This email is already registered. Please sign in instead.",
            });
            setIsSignUp(false);
            return;
          } else if (error.message?.includes("rate limit")) {
            toast.error("Too many attempts", {
              description: "Please wait a few minutes before trying again.",
            });
            return;
          }
          throw error;
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
      className="min-h-screen min-h-[100dvh] flex items-center justify-center px-fluid-md py-fluid-lg relative bg-background"
      style={{
        backgroundImage: `url(${authBackground})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        paddingTop: 'max(env(safe-area-inset-top, 0px), var(--space-lg))',
        paddingBottom: 'max(env(safe-area-inset-bottom, 0px), var(--space-lg))',
      }}
    >
      {/* Animated matte black/grey gradient overlay */}
      <div className="absolute inset-0 auth-gradient-overlay" />
      <div className="w-full max-w-md relative z-10" style={{ width: '100%', maxWidth: '28rem', position: 'relative', zIndex: 10 }}>
        {/* Glassmorphic Card */}
        <div className="backdrop-blur-xl bg-background/20 border border-border/30 rounded-2xl shadow-2xl"
          style={{
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            background: 'hsl(var(--background) / 0.2)',
            border: '1px solid hsl(var(--border) / 0.3)',
            borderRadius: '16px',
            padding: 'clamp(24px, 5vw, 32px)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'clamp(16px, 3vw, 24px)',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
          }}
        >
          {/* Header */}
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '96px', height: '96px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img 
                src={jetLogo} 
                alt="JET Logo" 
                style={{ width: '100%', height: '100%', objectFit: 'contain', filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.3))' }}
                width="96"
                height="96"
                fetchPriority="high"
                decoding="async"
              />
            </div>
            <h1 className="text-3xl font-extrabold bg-gradient-to-r from-foreground to-primary bg-clip-text text-transparent"
              style={{ fontSize: 'clamp(1.5rem, 5vw, 1.875rem)', fontWeight: 800 }}>
              Welcome to JET
            </h1>
            <p style={{ color: 'hsl(var(--muted-foreground))', fontSize: '14px' }}>
              {isResettingPassword
                ? "Set your new password"
                : isForgotPassword
                ? "Reset your password"
                : isSignUp
                ? "Create an account to get started"
                : "Sign in to discover what's hot in your area"}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={isResettingPassword ? handlePasswordReset : isForgotPassword ? handleForgotPassword : handleAuth} className="space-y-4" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Email field - only show if not resetting password */}
          {!isResettingPassword && (
            <div className="space-y-2" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <Input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setValidationErrors(prev => ({ ...prev, email: undefined }));
                }}
                required
                className={`bg-card border-border ${validationErrors.email ? "border-destructive" : ""}`}
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
              <div className="space-y-2" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div className="relative" style={{ position: 'relative' }}>
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="Password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setValidationErrors(prev => ({ ...prev, password: undefined }));
                    }}
                    required
                    className={`bg-card border-border pr-10 ${validationErrors.password ? "border-destructive" : ""}`}
                    autoComplete={isSignUp ? "new-password" : "current-password"}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-2 min-w-[44px] min-h-[44px] flex items-center justify-center touch-manipulation"
                    style={{ position: 'absolute', right: '4px', top: '50%', transform: 'translateY(-50%)', minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', cursor: 'pointer', color: 'hsl(var(--muted-foreground))' }}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {validationErrors.password && (
                  <p className="text-xs text-destructive">{validationErrors.password}</p>
                )}
                {(isSignUp || isResettingPassword) && !validationErrors.password && (
                  <p className="text-xs text-muted-foreground">
                    Must be 8+ characters with uppercase, lowercase, and number
                  </p>
                )}
              </div>

              {(isSignUp || isResettingPassword) && (
                <div className="space-y-2" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div className="relative" style={{ position: 'relative' }}>
                    <Input
                      type={showConfirmPassword ? "text" : "password"}
                      placeholder="Confirm Password"
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value);
                        setValidationErrors(prev => ({ ...prev, confirmPassword: undefined }));
                      }}
                      required
                      className={`bg-card border-border pr-10 ${validationErrors.confirmPassword ? "border-destructive" : ""}`}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-2 min-w-[44px] min-h-[44px] flex items-center justify-center touch-manipulation"
                      style={{ position: 'absolute', right: '4px', top: '50%', transform: 'translateY(-50%)', minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', cursor: 'pointer', color: 'hsl(var(--muted-foreground))' }}
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {validationErrors.confirmPassword && (
                    <p className="text-xs text-destructive">{validationErrors.confirmPassword}</p>
                  )}
                </div>
              )}

              {/* Consent checkboxes for signup */}
              {isSignUp && (
                <div className="space-y-3 pt-2" style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingTop: '8px' }}>
                  <div className="flex items-start space-x-3" style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                    <Checkbox
                      id="dataConsent"
                      checked={dataProcessingConsent}
                      onCheckedChange={(checked) => {
                        setDataProcessingConsent(checked === true);
                        setValidationErrors(prev => ({ ...prev, consent: undefined }));
                      }}
                      className="mt-0.5"
                      style={{ width: '18px', height: '18px', minWidth: '18px', marginTop: '2px', border: '2px solid hsl(var(--border))', borderRadius: '4px' }}
                    />
                    <label htmlFor="dataConsent" className="text-xs text-muted-foreground leading-relaxed cursor-pointer">
                      I agree to the{" "}
                      <Link to="/privacy-policy" className="text-primary hover:underline" target="_blank">
                        Privacy Policy
                      </Link>{" "}
                      and{" "}
                      <Link to="/terms-of-service" className="text-primary hover:underline" target="_blank">
                        Terms of Service
                      </Link>
                      . I understand my data will be processed securely after inactivity.
                      <span className="text-destructive">*</span>
                    </label>
                  </div>
                  {validationErrors.consent && (
                    <p className="text-xs text-destructive ml-6">{validationErrors.consent}</p>
                  )}
                  
                  <div className="flex items-start space-x-3" style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                    <Checkbox
                      id="locationConsent"
                      checked={locationConsent}
                      onCheckedChange={(checked) => {
                        setLocationConsent(checked === true);
                        setValidationErrors(prev => ({ ...prev, locationConsent: undefined }));
                      }}
                      className="mt-0.5"
                      style={{ width: '18px', height: '18px', minWidth: '18px', marginTop: '2px', border: '2px solid hsl(var(--border))', borderRadius: '4px' }}
                    />
                    <label htmlFor="locationConsent" className="text-xs text-muted-foreground leading-relaxed cursor-pointer">
                      I consent to location tracking to receive personalized deals and push notifications. You can disable this anytime in your Profile Settings.
                      <span className="text-destructive">*</span>
                    </label>
                  </div>
                  {validationErrors.locationConsent && (
                    <p className="text-xs text-destructive ml-6">{validationErrors.locationConsent}</p>
                  )}
                </div>
              )}
            </>
          )}

          <Button
            type="submit"
            disabled={isLoading}
            className="w-full bg-gradient-to-r from-primary to-primary-glow hover:opacity-90 text-primary-foreground font-semibold rounded-xl"
            style={{
              width: '100%',
              padding: '14px 24px',
              borderRadius: '12px',
              fontWeight: 600,
              fontSize: '16px',
              background: 'linear-gradient(to right, hsl(var(--primary)), hsl(var(--primary-glow, var(--primary))))',
              color: 'hsl(var(--primary-foreground))',
              border: 'none',
              cursor: 'pointer',
              minHeight: '48px',
            }}
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
          <div className="bg-muted/50 border border-border rounded-lg p-4 space-y-3" style={{ background: 'hsl(var(--muted) / 0.5)', border: '1px solid hsl(var(--border))', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div className="text-sm text-muted-foreground">
              Didn't receive the verification email?
            </div>
            <Button
              type="button"
              onClick={handleResendVerification}
              disabled={isResending || resendCooldown > 0}
              variant="outline"
              className="w-full"
              size="sm"
            >
              {isResending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              {resendCooldown > 0 
                ? `Resend in ${resendCooldown}s` 
                : "Resend Verification Email"}
            </Button>
          </div>
        )}

        {/* Toggle & Forgot Password */}
        {!isResettingPassword && (
          <div className="text-center space-y-2" style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {!isForgotPassword && !isSignUp && (
              <button
                onClick={() => setIsForgotPassword(true)}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors block w-full min-h-[44px] flex items-center justify-center touch-manipulation"
              >
                Forgot password?
              </button>
            )}
            
            <button
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
              className="text-sm text-muted-foreground hover:text-foreground transition-colors min-h-[44px] flex items-center justify-center w-full touch-manipulation"
            >
              {isForgotPassword 
                ? "Back to sign in"
                : isSignUp 
                ? "Already have an account? Sign in" 
                : "Don't have an account? Sign up"}
            </button>
          </div>
        )}

          {/* Features */}
           <div className="bg-card/30 backdrop-blur-sm rounded-xl border border-border/30"
             style={{ background: 'hsl(var(--card) / 0.3)', backdropFilter: 'blur(8px)', borderRadius: '12px', padding: '16px', border: '1px solid hsl(var(--border) / 0.3)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <p style={{ fontSize: '12px', fontWeight: 600, color: 'hsl(var(--foreground))' }}>With an account you can:</p>
            <ul style={{ fontSize: '12px', color: 'hsl(var(--muted-foreground))', display: 'flex', flexDirection: 'column', gap: '4px', listStyle: 'none', padding: 0, margin: 0 }}>
              <li>• Get real-time notifications for nearby deals</li>
              <li>• Save your favorite venues</li>
              <li>• Receive personalized recommendations</li>
              <li>• Track your activity and rewards</li>
            </ul>
          </div>
        </div>

        {/* Footer now rendered globally */}
      </div>
    </div>
  );
};

export default Auth;
