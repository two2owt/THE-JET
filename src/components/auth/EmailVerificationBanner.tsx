/**
 * In-app "verify your email" banner.
 *
 * Signing in with an unconfirmed address is possible (and some providers
 * confirm lazily), so once a session exists we check `email_confirmed_at` and
 * prompt for a resend when it's missing. Dismissal is per browser session, and
 * the banner disappears the moment the address is confirmed.
 */
import { useEffect, useState } from "react";
import { MailWarning, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { buildAuthRedirectUrl } from "@/lib/utils";

const DISMISS_KEY = "jet_email_verify_banner_dismissed";
const RESEND_COOLDOWN_SECONDS = 30;

export function EmailVerificationBanner() {
  const { user, session, refreshSession } = useAuth();
  const [dismissed, setDismissed] = useState(true);
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Read dismissal after mount so SSR and hydration agree.
  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(DISMISS_KEY) === "true");
    } catch {
      setDismissed(false);
    }
  }, []);

  // A user who confirms in another tab should stop seeing this without a
  // manual reload.
  useEffect(() => {
    if (!user || user.email_confirmed_at) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshSession();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [user, refreshSession]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const email = user?.email;
  const verified = Boolean(
    user?.email_confirmed_at ?? (user as { confirmed_at?: string } | null)
      ?.confirmed_at,
  );

  if (!session || !user || !email || verified || dismissed) return null;

  const handleResend = async () => {
    if (sending || cooldown > 0) return;
    setSending(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: buildAuthRedirectUrl("/verification-success") },
      });
      if (error) throw error;
      toast.success("Verification email sent", {
        description: `Check ${email} — the link expires in 24 hours.`,
      });
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Please try again.";
      // Supabase rate-limits resends; say so plainly instead of failing silently.
      toast.error("Couldn't send the verification email", {
        description: /rate|limit|seconds/i.test(message)
          ? "Too many requests — wait a minute and try again."
          : message,
      });
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } finally {
      setSending(false);
    }
  };

  const dismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, "true");
    } catch {
      // sessionStorage may be unavailable — banner just returns next mount.
    }
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 mb-3"
      style={{
        background: "hsl(var(--warm) / 0.12)",
        border: "1px solid hsl(var(--warm) / 0.35)",
      }}
    >
      <MailWarning
        className="w-4 h-4 shrink-0"
        style={{ color: "hsl(var(--warm))" }}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-foreground">
          Verify your email address
        </p>
        <p className="text-[11px] text-muted-foreground truncate">
          We sent a confirmation link to {email}.
        </p>
      </div>
      <button
        type="button"
        onClick={handleResend}
        disabled={sending || cooldown > 0}
        className="text-xs font-semibold text-primary hover:underline disabled:opacity-50 disabled:no-underline rounded-md px-2 py-1 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/50"
      >
        {sending ? "Sending…" : cooldown > 0 ? `Resend (${cooldown}s)` : "Resend"}
      </button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss email verification reminder"
        className="inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/50"
        style={{ width: "28px", height: "28px" }}
      >
        <X className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

export default EmailVerificationBanner;
