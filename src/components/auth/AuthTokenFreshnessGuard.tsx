/**
 * Validates Supabase token freshness after EVERY auth redirect.
 *
 * Mounted once in the app shell. When the current URL looks like the landing of
 * an auth redirect (email verification, password recovery, OAuth), we give
 * Supabase a short window to exchange the URL material for a session, then
 * check that a session actually exists, is not expiring, and matches the token
 * the link carried. Anything else opens a retry flow instead of leaving the
 * user on a page that silently did nothing.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useLocation } from "@/lib/router-compat";
import { RefreshCw, MailPlus, LogIn, ShieldAlert } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { logAuthRedirectEvent } from "@/lib/authRedirectLog";
import { rememberPostAuthRedirect } from "@/lib/postAuthRedirect";
import {
  evaluateTokenFreshness,
  readAuthRedirectContext,
  FRESHNESS_COPY,
  type AuthRedirectContext,
  type TokenFreshnessStatus,
} from "@/lib/authTokenFreshness";

/** How long Supabase gets to complete the exchange before we call it failed. */
const EXCHANGE_GRACE_MS = 4000;
const POLL_INTERVAL_MS = 400;

/** Pages that already own the failure UX — don't stack a dialog on them. */
const EXEMPT_PATHS = new Set(["/link-expired"]);

export const AuthTokenFreshnessGuard = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [failure, setFailure] = useState<{
    status: Exclude<TokenFreshnessStatus, "ok">;
    context: AuthRedirectContext;
  } | null>(null);
  const checkedRef = useRef<string | null>(null);

  const runCheck = useCallback(
    async (currentPath: string) => {
      const context = readAuthRedirectContext(
        window.location.search,
        window.location.hash,
        currentPath,
      );
      if (!context.isAuthRedirect || EXEMPT_PATHS.has(currentPath)) return;

      const deadline = Date.now() + EXCHANGE_GRACE_MS;
      let result = evaluateTokenFreshness(
        context,
        (await supabase.auth.getSession()).data.session,
      );

      // Poll: the SDK strips the hash and stores the session asynchronously.
      while (result.status !== "ok" && Date.now() < deadline) {
        if (result.status === "url_error") break;
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        result = evaluateTokenFreshness(
          context,
          (await supabase.auth.getSession()).data.session,
        );
      }

      if (result.status === "ok") {
        setFailure(null);
        return;
      }

      logAuthRedirectEvent({
        stage:
          context.flow === "recovery"
            ? "recovery_link_error"
            : context.flow === "signup"
              ? "verification_link_error"
              : "session_exchange_failed",
        from: currentPath,
        errorCode: context.errorCode,
        detail: `token freshness: ${result.status} (secondsRemaining=${result.secondsRemaining ?? "unknown"})`,
      });

      setFailure({ status: result.status, context });
    },
    [],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    // One check per landing URL (path + query + hash), re-armed on navigation.
    const key = `${pathname}${window.location.search}${window.location.hash}`;
    if (checkedRef.current === key) return;
    checkedRef.current = key;
    void runCheck(pathname);
  }, [pathname, runCheck]);

  if (!failure) return null;

  const copy = FRESHNESS_COPY[failure.status];
  const flow = failure.context.flow === "signup" ? "signup" : "recovery";

  const handleRetry = () => {
    setFailure(null);
    checkedRef.current = null;
    // A full reload replays the exchange with the URL material still intact.
    window.location.reload();
  };

  const handleNewLink = () => {
    setFailure(null);
    navigate({
      to: "/link-expired",
      search: {
        flow,
        ...(failure.context.errorCode
          ? { reason: failure.context.errorCode }
          : {}),
      },
    });
  };

  const handleSignIn = () => {
    setFailure(null);
    // Preserve where they were headed so sign-in returns them there.
    rememberPostAuthRedirect(pathname);
    navigate({ to: "/signin" });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && setFailure(null)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center mb-1"
            style={{
              background: "hsl(var(--warm) / 0.14)",
              border: "1px solid hsl(var(--warm) / 0.35)",
            }}
          >
            <ShieldAlert
              className="w-5 h-5"
              style={{ color: "hsl(var(--warm))" }}
              aria-hidden="true"
            />
          </div>
          <DialogTitle className="font-display">{copy.title}</DialogTitle>
          <DialogDescription>{copy.body}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            onClick={handleRetry}
            className="w-full"
            data-testid="token-freshness-retry"
          >
            <RefreshCw className="w-4 h-4 mr-2" aria-hidden="true" />
            Try again
          </Button>
          <Button variant="outline" onClick={handleNewLink} className="w-full">
            <MailPlus className="w-4 h-4 mr-2" aria-hidden="true" />
            Send me a new link
          </Button>
          <Button variant="ghost" onClick={handleSignIn} className="w-full">
            <LogIn className="w-4 h-4 mr-2" aria-hidden="true" />
            Back to sign in
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AuthTokenFreshnessGuard;
