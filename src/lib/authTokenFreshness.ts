/**
 * Post-redirect Supabase token freshness checks.
 *
 * Auth emails (verification, recovery) and OAuth hand back tokens in the URL.
 * Between the email client, our alias redirects and Supabase's own exchange,
 * the token can arrive missing, already expired, or — worst case — a STALE
 * session from a previous user can survive while the link's identity never
 * lands ("mismatch"). All three read to the user as "the link is broken".
 *
 * This module is pure logic (no React, no network) so it can be unit-tested
 * and reused by the guard component. Token VALUES never leave here: only
 * comparisons and statuses.
 */

import type { Session } from "@supabase/supabase-js";

export type AuthLinkFlow = "recovery" | "signup" | "oauth";

export interface AuthRedirectContext {
  /** True when the current URL looks like the landing of an auth redirect. */
  isAuthRedirect: boolean;
  /** Which email/OAuth flow the URL belongs to, when detectable. */
  flow: AuthLinkFlow | null;
  /** Auth material present in the URL (query or hash). */
  hasTokens: boolean;
  /** Access token carried by the URL hash, if any (never logged). */
  urlAccessToken: string | null;
  /** Supabase-reported failure already present in the URL. */
  errorCode: string | null;
}

const parse = (raw: string): URLSearchParams =>
  new URLSearchParams((raw ?? "").replace(/^[#?]/, ""));

const TOKEN_KEYS = [
  "access_token",
  "refresh_token",
  "code",
  "token",
  "token_hash",
  "confirmation_token",
] as const;

const flowFromType = (type: string | null): AuthLinkFlow | null => {
  if (!type) return null;
  if (type === "recovery") return "recovery";
  if (type === "signup" || type === "email_change" || type === "invite")
    return "signup";
  return null;
};

/** Classify the current URL without touching the network. */
export const readAuthRedirectContext = (
  search: string,
  hash: string,
  pathname = "",
): AuthRedirectContext => {
  const q = parse(search);
  const h = parse(hash);
  const hasTokens = TOKEN_KEYS.some((key) => !!(h.get(key) || q.get(key)));
  const errorCode =
    h.get("error_code") ??
    h.get("error") ??
    q.get("error_code") ??
    q.get("error") ??
    null;

  const flow =
    flowFromType(h.get("type")) ??
    flowFromType(q.get("type")) ??
    (q.get("reset") === "true" || pathname === "/reset-password"
      ? "recovery"
      : pathname === "/verification-success" || pathname === "/email-confirmed"
        ? "signup"
        : h.get("provider_token") || q.get("code")
          ? "oauth"
          : null);

  return {
    isAuthRedirect: hasTokens || !!errorCode || flow !== null,
    flow,
    hasTokens,
    urlAccessToken: h.get("access_token") ?? null,
    errorCode,
  };
};

export type TokenFreshnessStatus =
  | "ok"
  | "missing"
  | "expired"
  | "mismatch"
  | "url_error";

export interface TokenFreshness {
  status: TokenFreshnessStatus;
  /** Seconds until the session's access token expires (null when unknown). */
  secondsRemaining: number | null;
}

/** Treat a token that dies within this window as effectively stale. */
export const MIN_FRESHNESS_SECONDS = 30;

export const evaluateTokenFreshness = (
  context: AuthRedirectContext,
  session: Session | null,
  now: number = Date.now(),
): TokenFreshness => {
  if (context.errorCode) return { status: "url_error", secondsRemaining: null };

  if (!session) {
    return { status: "missing", secondsRemaining: null };
  }

  const expiresAt = session.expires_at ? session.expires_at * 1000 : null;
  const secondsRemaining =
    expiresAt === null ? null : Math.round((expiresAt - now) / 1000);

  if (secondsRemaining !== null && secondsRemaining <= MIN_FRESHNESS_SECONDS) {
    return { status: "expired", secondsRemaining };
  }

  // The link carried an access token but a DIFFERENT session is active — the
  // exchange never applied, so the user is looking at someone else's (or their
  // own previous) session while believing the link worked.
  if (
    context.urlAccessToken &&
    session.access_token &&
    context.urlAccessToken !== session.access_token
  ) {
    return { status: "mismatch", secondsRemaining };
  }

  return { status: "ok", secondsRemaining };
};

export const FRESHNESS_COPY: Record<
  Exclude<TokenFreshnessStatus, "ok">,
  { title: string; body: string }
> = {
  missing: {
    title: "We couldn't finish signing you in",
    body: "This link didn't hand us a valid session. It may have already been used, or your browser blocked the hand-off.",
  },
  expired: {
    title: "That link has already expired",
    body: "Reset and verification links are short-lived. Request a fresh one and it will work right away.",
  },
  mismatch: {
    title: "This link belongs to a different session",
    body: "We're still signed in as someone else, so the link couldn't be applied. Retry to complete the hand-off.",
  },
  url_error: {
    title: "This link is no longer valid",
    body: "The sign-in service rejected it — links stop working once used or after they time out.",
  },
};
