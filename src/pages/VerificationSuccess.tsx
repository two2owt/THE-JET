import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router";
import { CheckCircle2, Mail, Loader2, MailCheck, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const RESEND_EMAIL_KEY = "jet_verification_email";

export default function VerificationSuccess() {
  const navigate = useNavigate();
  const location = useLocation();
  const [countdown, setCountdown] = useState(5);
  const [resendEmail, setResendEmail] = useState("");
  const [resendStatus, setResendStatus] = useState<
    "idle" | "sending" | "sent" | "error"
  >("idle");
  const [resendMessage, setResendMessage] = useState<string>("");
  const [isVerified, setIsVerified] = useState(false);

  useEffect(() => {
    // Defensive: strip any query params (e.g. ?mode=signup) so that
    // navigating back to /auth never re-triggers a signup submission.
    if (location.search || location.hash) {
      window.history.replaceState({}, "", "/verification-success");
    }

    // Auto-fill email from: query param > localStorage > current user
    const params = new URLSearchParams(location.search);
    const emailFromQuery = params.get("email");
    const emailFromStorage = localStorage.getItem(RESEND_EMAIL_KEY);

    if (emailFromQuery) {
      setResendEmail(emailFromQuery);
    } else if (emailFromStorage) {
      setResendEmail(emailFromStorage);
    }

    // Re-check verification status: refresh session, then read user.
    // This ensures the "Go to app" button appears immediately after the
    // user clicks the email link (which updates email_confirmed_at server-side).
    let cancelled = false;
    const checkVerification = async () => {
      try {
        await supabase.auth.refreshSession();
      } catch {
        // ignore — fall back to whatever session we have
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled || !user) return;
      if (user.email && !emailFromQuery && !emailFromStorage) {
        setResendEmail(user.email);
      }
      if (user.email_confirmed_at || (user as any).confirmed_at) {
        setIsVerified(true);
      }
    };
    checkVerification();

    // Listen for auth changes (e.g. USER_UPDATED after verification)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        const user = session?.user;
        if (user?.email_confirmed_at || (user as any)?.confirmed_at) {
          setIsVerified(true);
        }
      }
    );

    // Also re-check when the tab regains focus (user returning from email)
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        checkVerification();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          navigate("/auth?mode=signin", { replace: true });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      cancelled = true;
      clearInterval(timer);
      subscription.unsubscribe();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [navigate, location.search, location.hash]);

  const handleResend = async () => {
    const email = resendEmail.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setResendStatus("error");
      setResendMessage("Please enter a valid email address.");
      return;
    }

    setResendStatus("sending");
    setResendMessage("Sending a new verification link…");

    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/verification-success`,
        },
      });

      if (error) {
        setResendStatus("error");
        setResendMessage(
          error.message ||
            "We couldn't resend the verification email. Please try again later."
        );
        toast.error("Resend failed");
        return;
      }

      setResendStatus("sent");
      setResendMessage(
        `Verification link sent to ${email}. Check your inbox (and spam folder).`
      );
      // Clear stored email since verification was resent
      localStorage.removeItem(RESEND_EMAIL_KEY);
      toast.success("Verification email sent");
    } catch {
      setResendStatus("error");
      setResendMessage(
        "Something went wrong while resending the email. Please try again."
      );
      toast.error("Resend failed");
    }
  };

  const isLocked = resendStatus === "sending" || resendStatus === "sent";

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 sm:px-6 md:px-8 lg:px-10">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex justify-center">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center ring-2 ring-primary/30 shadow-glow">
            <CheckCircle2 className="w-12 h-12 text-primary" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-3xl font-extrabold bg-gradient-to-r from-foreground to-primary bg-clip-text text-transparent">
            Email Verified!
          </h1>
          <p className="text-muted-foreground">
            Welcome to JET! Your email has been successfully verified.
          </p>
        </div>

        {/* Verification status banner — explains current state + next step */}
        <div
          role="status"
          aria-live="polite"
          className={`p-4 rounded-xl backdrop-blur-sm shadow-card text-left flex items-start gap-3 ${
            isVerified
              ? "bg-primary/10 border border-primary/30"
              : "bg-card/80 border border-border/60"
          }`}
        >
          <div
            className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${
              isVerified
                ? "bg-primary/20 text-primary"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {isVerified ? (
              <MailCheck className="w-5 h-5" />
            ) : (
              <Clock className="w-5 h-5" />
            )}
          </div>
          <div className="flex-1 space-y-1">
            <p className="text-sm font-semibold text-foreground">
              {isVerified ? "Your email is verified" : "Verification pending"}
            </p>
            <p className="text-xs text-muted-foreground">
              {isVerified
                ? "You're all set. Tap “Go to app” below to start exploring JET."
                : `Check your inbox${
                    resendEmail ? ` (${resendEmail})` : ""
                  } and click the verification link. You'll be redirected to sign in in ${countdown}s.`}
            </p>
          </div>
        </div>

        <Button 
          onClick={() => navigate("/auth?mode=signin", { replace: true })} 
          variant="jet"
          className="w-full"
          size="lg"
        >
          Sign In Now
        </Button>

        {isVerified ? (
          <div className="p-4 rounded-xl bg-card/70 backdrop-blur-sm border border-primary/30 shadow-card text-center space-y-3">
            <div className="flex items-center justify-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-primary" />
              <p className="text-sm font-semibold text-foreground">
                Your email is verified
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              You're all set. Jump into the app to get started.
            </p>
            <Button
              type="button"
              onClick={() => navigate("/", { replace: true })}
              variant="jet"
              className="w-full"
              size="lg"
            >
              Go to app
            </Button>
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-card/70 backdrop-blur-sm border border-border/60 shadow-card text-left space-y-3">
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-primary" />
              <p className="text-sm font-semibold text-foreground">
                Didn't get the email?
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Enter your email and we'll send a new verification link.
            </p>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={resendEmail}
              onChange={(e) => {
                setResendEmail(e.target.value);
                if (resendStatus === "error") {
                  setResendStatus("idle");
                  setResendMessage("");
                }
              }}
              disabled={isLocked}
              className="w-full h-10 px-3 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-60 disabled:cursor-not-allowed"
            />
            <Button
              type="button"
              onClick={handleResend}
              disabled={isLocked || !resendEmail.trim()}
              variant="outline"
              className="w-full"
              size="sm"
            >
              {resendStatus === "sending" && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              {resendStatus === "sending"
                ? "Sending…"
                : resendStatus === "sent"
                  ? "Verification link sent"
                  : "Resend verification email"}
            </Button>
            {resendMessage && (
              <p
                role="status"
                aria-live="polite"
                className={`text-xs ${
                  resendStatus === "error"
                    ? "text-destructive"
                    : resendStatus === "sent"
                      ? "text-primary"
                      : "text-muted-foreground"
                }`}
              >
                {resendMessage}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
