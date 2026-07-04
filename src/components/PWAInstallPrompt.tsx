import { useEffect, useState } from "react";
import { Download, X, Share, Plus, Zap, WifiOff, BellRing, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePWAInstall } from "@/hooks/usePWAInstall";
import { useMultiDirectionSwipe } from "@/hooks/useMultiDirectionSwipe";
import jetLogo from "@/assets/jet-logo-256.webp";

export interface PWAInstallPromptProps {
  /**
   * Optional sign-up call-to-action shown above the install controls. When
   * provided, the prompt re-frames itself as a "join + install" moment for
   * anonymous visitors: a primary Sign Up button is rendered first, with the
   * installable-app benefits surfaced as the value prop for creating an
   * account.
   */
  signUpCta?: {
    onSignUp: () => void;
    headline?: string;
    subtext?: string;
    buttonLabel?: string;
  };
}

const DISMISS_KEY = "pwa-install-dismissed";

export const PWAInstallPrompt = ({ signUpCta }: PWAInstallPromptProps = {}) => {
  const { isInstallable, isInstalled, isIOS, showPrompt, installApp, dismissPrompt } = usePWAInstall();

  // Local dismissed flag guarantees the prompt hides immediately regardless
  // of which path opened it (installable event, iOS timer, or sign-up mode
  // that only reads localStorage on mount).
  const [locallyDismissed, setLocallyDismissed] = useState(false);

  const handleDismiss = () => {
    setLocallyDismissed(true);
    dismissPrompt();
  };

  const { handlers, style } = useMultiDirectionSwipe({
    onDismiss: handleDismiss,
    threshold: 80
  });

  const isSignUpMode = !!signUpCta;

  // Allow Escape to close the prompt like any modal dialog.
  useEffect(() => {
    if (locallyDismissed || isInstalled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [locallyDismissed, isInstalled]);

  if (locallyDismissed) return null;
  if (isInstalled) return null;
  if (!isSignUpMode) {
    if (!showPrompt || !isInstallable) return null;
  } else {
    // Sign-up mode renders on any device — the value is the account, the
    // install is the upsell. Still respect a permanent dismissal.
    if (typeof window !== "undefined") {
      const dismissedAt = localStorage.getItem(DISMISS_KEY);
      if (dismissedAt) {
        return null;
      }
    }
  }

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 p-4 pb-[calc(var(--safe-area-inset-bottom,0px)+1rem)] animate-in slide-in-from-bottom-4 duration-500"
      role="dialog"
      aria-label={isSignUpMode ? "Join JET and install the app" : "Install JET"}
    >
      <div
        className="max-w-md mx-auto bg-card/95 backdrop-blur-2xl border border-border/60 rounded-3xl shadow-2xl overflow-hidden cursor-grab active:cursor-grabbing ring-1 ring-primary/10"
        {...handlers}
        style={style}
      >
        {/* Swipe indicator */}
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
        </div>
        {/* Header gradient accent — matches Dark Luxe brand */}
        <div className="h-[2px] bg-gradient-to-r from-primary via-accent to-primary" />

        <div className="p-5">
          {/* App info row */}
          <div className="flex items-center gap-3 mb-5">
            <div className="flex-shrink-0 w-14 h-14 rounded-2xl bg-gradient-to-br from-background to-muted border border-border/50 flex items-center justify-center overflow-hidden shadow-lg ring-1 ring-accent/20">
              <img
                src={jetLogo}
                alt="JET"
                width={40}
                height={40}
                className="w-10 h-10 object-contain"
                fetchPriority="high"
                decoding="async"
              />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-display text-xl font-bold tracking-tight text-foreground leading-tight">
                {isSignUpMode ? (signUpCta!.headline ?? "Join JET") : "Install JET"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {isSignUpMode
                  ? (signUpCta!.subtext ?? "Create your free profile, then install the app")
                  : "Get the full app experience"}
              </p>
            </div>
            <button
              onClick={handleDismiss}
              className="flex-shrink-0 p-2 rounded-full hover:bg-muted/60 transition-colors"
              aria-label="Dismiss"
            >
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>

          {/* Sign-up primary CTA (anonymous visitors) */}
          {isSignUpMode && (
            <Button
              size="sm"
              className="w-full gap-2 mb-4"
              onClick={signUpCta!.onSignUp}
            >
              <UserPlus className="w-4 h-4" />
              {signUpCta!.buttonLabel ?? "Sign up — it's free"}
            </Button>
          )}

          {/* Benefits */}
          <div className="grid grid-cols-3 gap-2 mb-5">
            {[
              { Icon: Zap, label: "Faster", sub: "Instant load" },
              { Icon: WifiOff, label: "Offline", sub: "Works anywhere" },
              { Icon: BellRing, label: "Alerts", sub: "Deal pings" },
            ].map(({ Icon, label, sub }) => (
              <div
                key={label}
                className="bg-muted/30 border border-border/40 rounded-xl p-2.5 text-center flex flex-col items-center gap-1"
              >
                <Icon className="w-4 h-4 text-accent" />
                <p className="text-xs font-semibold text-foreground leading-none">{label}</p>
                <p className="text-[10px] text-muted-foreground leading-tight">{sub}</p>
              </div>
            ))}
          </div>

          {/* iOS-specific instructions */}
          {isIOS ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground text-center">
                {isSignUpMode ? "Then install on iPhone/iPad:" : "To install on iPhone/iPad:"}
              </p>
              <div className="flex items-center justify-center gap-6 py-2">
                <div className="flex flex-col items-center gap-1">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Share className="w-5 h-5 text-primary" />
                  </div>
                  <span className="text-[10px] text-muted-foreground">Tap Share</span>
                </div>
                <div className="text-muted-foreground">→</div>
                <div className="flex flex-col items-center gap-1">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Plus className="w-5 h-5 text-primary" />
                  </div>
                  <span className="text-[10px] text-muted-foreground text-center leading-tight">Add to<br/>Home Screen</span>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={handleDismiss}
              >
                Got it
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={handleDismiss}
              >
                Maybe later
              </Button>
              {isInstallable && (
                <Button
                  size="sm"
                  className="flex-1 gap-2"
                  onClick={installApp}
                >
                  <Download className="w-4 h-4" />
                  Install
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
