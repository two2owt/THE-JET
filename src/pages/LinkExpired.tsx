/**
 * Expired / invalid auth link recovery screen.
 *
 * Supabase recovery and confirmation links are single-use and short-lived, so
 * the most common auth complaint is "the link doesn't work". Instead of a toast
 * that disappears, we land the user here with a plain explanation of WHY and
 * one-click ways out: request a fresh password reset, or resend the
 * verification email.
 *
 * Reached from `/link-expired?reason=<supabase error_code>&flow=recovery|signup`.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { Clock, KeyRound, MailCheck, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { buildAuthRedirectUrl } from "@/lib/utils";
import { logAuthRedirectEvent } from "@/lib/authRedirectLog";
import {
  peekPostAuthRedirect,
  rememberPostAuthRedirect,
} from "@/lib/postAuthRedirect";

type Flow = "recovery" | "signup";

const REASON_COPY: Record<string, string> = {
  otp_expired:
    "This link has expired. Reset and confirmation links are only valid for a short time.",
  access_denied:
    "This link is no longer valid — it may have already been used, or a newer link was requested.",
  invalid_request: "This link is malformed or incomplete.",
  email_link_invalid: "This link has already been used.",
};

export default function LinkExpired() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as {
    reason?: string;
    flow?: string;
    email?: string;
    returnTo?: string;
  };
  const flow: Flow = search.flow === "signup" ? "signup" : "recovery";
  const [email, setEmail] = useState(search.email ?? "");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  // Where to send them once they're signed in again: an explicit ?returnTo,
  // otherwise whatever was remembered before the auth detour.
  const returnTo = search.returnTo ?? peekPostAuthRedirect() ?? null;

  const explanation = useMemo(
    () =>
      (search.reason && REASON_COPY[search.reason]) ??
      "This link has expired or has already been used.",
    [search.reason],
  );

  // Record the landing so a spike of dead links is visible server-side without
  // waiting for a user to report it.
  useEffect(() => {
    logAuthRedirectEvent({
      stage: flow === "signup" ? "verification_link_error" : "recovery_link_error",
      from: "/link-expired",
      errorCode: search.reason ?? null,
      detail: `expired-state page shown (flow=${flow})`,
    });
  }, [flow, search.reason]);

  const handleSend = async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      toast.error("Enter your email address first");
      return;
    }
    setSending(true);
    try {
      const { error } =
        flow === "signup"
          ? await supabase.auth.resend({
              type: "signup",
              email: trimmed,
              options: {
                emailRedirectTo: buildAuthRedirectUrl("/verification-success"),
              },
            })
          : await supabase.auth.resetPasswordForEmail(trimmed, {
              redirectTo: buildAuthRedirectUrl("/reset-password", {
                reset: "true",
              }),
            });
      if (error) throw error;
      setSent(true);
      toast.success(
        flow === "signup"
          ? "Verification email sent"
          : "Password reset email sent",
        { description: `Check ${trimmed} — the new link expires in 1 hour.` },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Please try again.";
      toast.error("Couldn't send the email", {
        description: /rate|limit|seconds/i.test(message)
          ? "Too many requests — wait a minute and try again."
          : message,
      });
    } finally {
      setSending(false);
    }
  };

  const isRecovery = flow === "recovery";

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-10 bg-background">
      <div
        className="w-full max-w-md rounded-2xl p-6"
        style={{
          background: "hsl(var(--card) / 0.92)",
          border: "1px solid hsl(var(--border) / 0.6)",
          boxShadow: "0 24px 60px -30px hsl(var(--primary) / 0.35)",
        }}
      >
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center mb-4"
          style={{
            background: "hsl(var(--warm) / 0.14)",
            border: "1px solid hsl(var(--warm) / 0.35)",
          }}
        >
          <ShieldAlert
            className="w-6 h-6"
            style={{ color: "hsl(var(--warm))" }}
            aria-hidden="true"
          />
        </div>

        <p
          className="inline-flex items-center gap-1.5 mb-3 px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wide"
          style={{
            background: "hsl(var(--muted) / 0.5)",
            border: "1px solid hsl(var(--border) / 0.6)",
            color: "hsl(var(--muted-foreground))",
          }}
          data-testid="link-expired-type"
        >
          {isRecovery ? (
            <KeyRound className="w-3 h-3" aria-hidden="true" />
          ) : (
            <MailCheck className="w-3 h-3" aria-hidden="true" />
          )}
          {isRecovery ? "Password reset link" : "Email verification link"}
        </p>

        <h1 className="font-display text-2xl font-bold text-foreground mb-2">
          {isRecovery ? "Reset link expired" : "Verification link expired"}
        </h1>
        <p className="text-sm text-muted-foreground mb-1">{explanation}</p>
        <p className="text-xs text-muted-foreground flex items-center gap-1.5 mb-5">
          <Clock className="w-3.5 h-3.5" aria-hidden="true" />
          Links stop working once used, or after they time out.
        </p>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="link-expired-email">Email address</Label>
            <Input
              id="link-expired-email"
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleSend();
              }}
            />
          </div>

          <Button
            type="button"
            onClick={handleSend}
            disabled={sending}
            className="w-full"
            data-testid="link-expired-primary"
          >
            {isRecovery ? (
              <KeyRound className="w-4 h-4 mr-2" aria-hidden="true" />
            ) : (
              <MailCheck className="w-4 h-4 mr-2" aria-hidden="true" />
            )}
            {sending
              ? "Sending…"
              : sent
                ? "Send another link"
                : isRecovery
                  ? "Email me a new reset link"
                  : "Resend verification email"}
          </Button>

          {/* The other flow, one click away — users often can't tell which
              kind of link they clicked. */}
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() =>
              navigate({
                to: "/link-expired",
                search: {
                  flow: isRecovery ? "signup" : "recovery",
                  ...(email.trim() ? { email: email.trim() } : {}),
                  ...(returnTo ? { returnTo } : {}),
                },
                replace: true,
              })
            }
          >
            {isRecovery
              ? "I need a verification email instead"
              : "I need a password reset instead"}
          </Button>

          <Button
            type="button"
            variant="ghost"
            className="w-full"
            data-testid="link-expired-signin"
            onClick={() => {
              // Keep the destination so sign-in lands them where they meant
              // to go instead of dumping them on the home map.
              if (returnTo) rememberPostAuthRedirect(returnTo);
              navigate({ to: "/signin" });
            }}
          >
            Back to sign in
            {returnTo ? (
              <span className="ml-1 text-xs text-muted-foreground">
                (returns to {returnTo})
              </span>
            ) : null}
          </Button>
        </div>
      </div>
    </main>
  );
}
