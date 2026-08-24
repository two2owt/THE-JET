/**
 * Auth redirect / token diagnostics.
 *
 * When a user reports "the reset link 404s" or "the verify link signs me
 * nowhere", we need to know: which URL did they land on, did it carry Supabase
 * tokens, and did those tokens survive the redirect into the canonical route.
 *
 * SECURITY: token VALUES are never logged, stored, or transmitted — only which
 * token keys were present (`access_token`, `code`, `token_hash`, …) and their
 * lengths. Emails are reduced to a domain. The payload is deliberately
 * boring metadata.
 */

import { supabase } from "@/integrations/supabase/client";
import { reportError } from "@/lib/sentry";

export type AuthRedirectStage =
  | "alias_redirect"
  | "alias_token_loss"
  | "not_found"
  | "callback_no_session"
  | "recovery_link_error"
  | "verification_link_error"
  | "session_exchange_failed";

/** Hash/query keys that carry Supabase auth material. */
const TOKEN_KEYS = [
  "access_token",
  "refresh_token",
  "provider_token",
  "provider_refresh_token",
  "code",
  "token",
  "token_hash",
  "confirmation_token",
] as const;

export interface AuthRedirectEvent {
  stage: AuthRedirectStage;
  /** The path the user actually landed on (no query, no hash). */
  from: string;
  /** The canonical path we forwarded to, when there is one. */
  to?: string;
  /** Supabase `error` / `error_code` from the URL, when present. */
  errorCode?: string | null;
  errorDescription?: string | null;
  /** Free-form note, e.g. "hash dropped by redirect". */
  detail?: string;
}

/** Present token keys with lengths only — never the values themselves. */
const describeTokens = (raw: string): Record<string, number> => {
  const out: Record<string, number> = {};
  if (!raw) return out;
  const params = new URLSearchParams(raw.replace(/^[#?]/, ""));
  for (const key of TOKEN_KEYS) {
    const value = params.get(key);
    if (value) out[key] = value.length;
  }
  return out;
};

/** Non-token URL params are safe to keep verbatim for triage. */
const SAFE_PARAM_KEYS = new Set([
  "type",
  "reset",
  "mode",
  "error",
  "error_code",
  "redirect_to",
  "next",
]);

const describeSafeParams = (raw: string): Record<string, string> => {
  const out: Record<string, string> = {};
  if (!raw) return out;
  const params = new URLSearchParams(raw.replace(/^[#?]/, ""));
  params.forEach((value, key) => {
    if (SAFE_PARAM_KEYS.has(key)) out[key] = value.slice(0, 64);
  });
  return out;
};

export interface AuthRedirectDiagnostic {
  stage: AuthRedirectStage;
  from: string;
  to: string | null;
  errorCode: string | null;
  errorDescription: string | null;
  detail: string | null;
  /** Token key -> length. Values are never included. */
  hashTokens: Record<string, number>;
  queryTokens: Record<string, number>;
  hashParams: Record<string, string>;
  queryParams: Record<string, string>;
  hasSession: boolean;
  userAgent: string;
  referrerOrigin: string | null;
  at: string;
}

/**
 * Builds the sanitized diagnostic for the CURRENT browser URL. Exported so the
 * smoke tests can assert that tokens are detected and never echoed.
 */
export const buildAuthRedirectDiagnostic = (
  event: AuthRedirectEvent,
  hasSession = false,
): AuthRedirectDiagnostic => {
  const search = typeof window === "undefined" ? "" : window.location.search;
  const hash = typeof window === "undefined" ? "" : window.location.hash;
  let referrerOrigin: string | null = null;
  try {
    referrerOrigin = document.referrer
      ? new URL(document.referrer).origin
      : null;
  } catch {
    referrerOrigin = null;
  }
  return {
    stage: event.stage,
    from: event.from,
    to: event.to ?? null,
    errorCode: event.errorCode ?? null,
    errorDescription: event.errorDescription?.slice(0, 200) ?? null,
    detail: event.detail ?? null,
    hashTokens: describeTokens(hash),
    queryTokens: describeTokens(search),
    hashParams: describeSafeParams(hash),
    queryParams: describeSafeParams(search),
    hasSession,
    userAgent:
      typeof navigator === "undefined" ? "" : navigator.userAgent.slice(0, 200),
    referrerOrigin,
    at: new Date().toISOString(),
  };
};

/** True when the URL carries auth material that a redirect must preserve. */
export const urlCarriesAuthTokens = (search: string, hash: string): boolean =>
  Object.keys(describeTokens(hash)).length > 0 ||
  Object.keys(describeTokens(search)).length > 0;

/**
 * Fire-and-forget: logs to the console, to Sentry (for the failure stages), and
 * to the server so the same incident is visible without asking the user for
 * devtools output. Never throws and never blocks navigation.
 */
export const logAuthRedirectEvent = (event: AuthRedirectEvent): void => {
  if (typeof window === "undefined") return;

  // Everything below must run SYNCHRONOUSLY: callers (alias redirects) call
  // window.location.replace() immediately afterwards, so any await would let
  // the page unload before the diagnostic ever leaves the browser.
  const diagnostic = buildAuthRedirectDiagnostic(event, false);
  const isFailure = event.stage !== "alias_redirect";

  // Console: always on, including production. This is metadata, not secrets,
  // and it is the first thing a user can screenshot for us.
  (isFailure ? console.warn : console.info)(
    `[auth-redirect] ${diagnostic.stage} ${diagnostic.from}` +
      (diagnostic.to ? ` -> ${diagnostic.to}` : ""),
    diagnostic,
  );

  if (isFailure) {
    void reportError(new Error(`auth redirect: ${diagnostic.stage}`), {
      // Sanitized metadata only — no token values.
      ...diagnostic,
    });
  }

  // Server-side mirror. Public endpoint by necessity (these failures happen
  // while the user has no session); it only accepts this sanitized shape.
  const body = JSON.stringify(diagnostic);
  try {
    // sendBeacon survives the imminent navigation; fetch+keepalive is the
    // fallback for browsers/tests where it is unavailable.
    const beacon = navigator.sendBeacon?.bind(navigator);
    const sent = beacon
      ? beacon(
          "/api/public/auth-redirect-log",
          new Blob([body], { type: "application/json" }),
        )
      : false;
    if (!sent) {
      void fetch("/api/public/auth-redirect-log", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {
        /* offline or blocked — console + Sentry still carry the signal */
      });
    }
  } catch {
    /* diagnostics must never break an auth flow */
  }

  // Session presence is useful but not worth delaying the redirect for, so it
  // is reported as a follow-up event only when the page is still alive.
  if (isFailure) {
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!data.session) return;
        console.info(
          `[auth-redirect] ${diagnostic.stage} had an active session`,
        );
      })
      .catch(() => {
        /* ignore */
      });
  }
};

