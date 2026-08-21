/**
 * Policy for when the foreground-location prompt may reappear.
 *
 * Previously the prompt was strictly one-and-done: a single dismissal wrote a
 * localStorage flag and the user was never asked again, so most accounts never
 * granted geolocation and never contributed a point to the heatmap.
 *
 * The rules now are:
 * - Every NEW sign-in (a different user, or the same user with a newer
 *   `last_sign_in_at`) re-opens the prompt, subject to a short hard cooldown so
 *   a user who signs in twice in one evening isn't nagged twice.
 * - Otherwise the snooze expires after a configurable window that backs off
 *   with each dismissal (base -> 2x -> 4x ...), capped.
 * - Nothing here can force a prompt when the browser permission is already
 *   `granted` or `denied`; the caller still gates on that.
 */

const DISMISS_AT_KEY = "location-permission-prompt-dismissed";
const DISMISS_COUNT_KEY = "location-permission-prompt-dismiss-count";
const LAST_PROMPT_AT_KEY = "location-permission-prompt-last-at";
const LAST_SESSION_KEY = "location-permission-prompt-last-session";
/** Legacy one-and-done flag; only honoured when the Permissions API is absent. */
export const ASKED_KEY = "location-permission-prompt-asked";
/** Sticky latch: platform permission was granted at some point — stop asking. */
export const GRANTED_KEY = "location-permission-granted";

const DAY_MS = 24 * 60 * 60 * 1000;

const num = (raw: unknown, fallback: number) => {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/** Base snooze after a dismissal. Override with `VITE_LOCATION_PROMPT_SNOOZE_DAYS`. */
export const BASE_SNOOZE_MS =
  num(import.meta.env.VITE_LOCATION_PROMPT_SNOOZE_DAYS, 3) * DAY_MS;
/** Snooze never grows past this, so the prompt always comes back eventually. */
export const MAX_SNOOZE_MS = 30 * DAY_MS;
/**
 * Minimum gap between two prompts regardless of sign-ins. Override with
 * `VITE_LOCATION_PROMPT_MIN_GAP_HOURS`.
 */
export const MIN_REPROMPT_GAP_MS =
  num(import.meta.env.VITE_LOCATION_PROMPT_MIN_GAP_HOURS, 12) * 60 * 60 * 1000;

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage disabled */
  }
};
const remove = (key: string) => {
  try {
    localStorage.removeItem(key);
  } catch {
    /* storage disabled */
  }
};

const parseTs = (raw: string | null): number | null => {
  if (!raw) return null;
  const t = parseInt(raw, 10);
  return Number.isFinite(t) ? t : null;
};

/**
 * Stable identity for "this sign-in". Changes when a different user signs in,
 * or when the same user signs in again (Supabase bumps `last_sign_in_at`).
 */
export const sessionSignature = (
  userId: string | null | undefined,
  lastSignInAt: string | null | undefined,
): string => (userId ? `${userId}:${lastSignInAt ?? ""}` : "anon");

export const snoozeFor = (dismissCount: number): number =>
  Math.min(BASE_SNOOZE_MS * 2 ** Math.max(0, dismissCount - 1), MAX_SNOOZE_MS);

export type PromptDecision = {
  show: boolean;
  /** Present when `show` is false — useful for dev diagnostics. */
  reason?: string;
};

/**
 * Decide whether the prompt may open for the current session.
 * `permissionsApiAvailable === false` falls back to the legacy asked-once flag
 * so browsers without the Permissions API can't loop the prompt.
 */
export const shouldPromptForLocation = (opts: {
  signature: string;
  permissionsApiAvailable: boolean;
  now?: number;
}): PromptDecision => {
  const now = opts.now ?? Date.now();

  // The user already allowed location on this device — never ask again, even
  // on a brand new sign-in. Re-grants/revokes come from the browser/OS.
  if (read(GRANTED_KEY)) return { show: false, reason: "already granted" };

  const lastPromptAt = parseTs(read(LAST_PROMPT_AT_KEY));

  if (lastPromptAt !== null && now - lastPromptAt < MIN_REPROMPT_GAP_MS)
    return { show: false, reason: "within minimum re-prompt gap" };

  // A new sign-in always earns a fresh ask (past the gap above).
  const lastSignature = read(LAST_SESSION_KEY);
  const newSignIn = opts.signature !== "anon" && lastSignature !== opts.signature;
  if (newSignIn) return { show: true };

  if (!opts.permissionsApiAvailable && read(ASKED_KEY))
    return { show: false, reason: "already asked (no Permissions API)" };

  const dismissedAt = parseTs(read(DISMISS_AT_KEY));
  if (dismissedAt !== null) {
    const count = parseTs(read(DISMISS_COUNT_KEY)) ?? 1;
    if (now - dismissedAt < snoozeFor(count))
      return { show: false, reason: "snoozed" };
    remove(DISMISS_AT_KEY);
  }

  return { show: true };
};

/** Call when the dialog actually opens. */
export const markLocationPromptShown = (signature: string) => {
  write(LAST_PROMPT_AT_KEY, Date.now().toString());
  write(LAST_SESSION_KEY, signature);
  write(ASKED_KEY, "1");
};

/** Call when the user dismisses or the browser blocks the request. */
export const markLocationPromptDismissed = (signature: string) => {
  const count = (parseTs(read(DISMISS_COUNT_KEY)) ?? 0) + 1;
  write(DISMISS_AT_KEY, Date.now().toString());
  write(DISMISS_COUNT_KEY, count.toString());
  write(LAST_SESSION_KEY, signature);
  write(ASKED_KEY, "1");
};

/** Call when permission ends up granted through any surface — stop asking. */
export const markLocationPermissionResolved = (signature: string) => {
  write(GRANTED_KEY, "1");
  remove(DISMISS_AT_KEY);
  remove(DISMISS_COUNT_KEY);
  write(LAST_SESSION_KEY, signature);
  write(ASKED_KEY, "1");
};

/** Clear the granted latch (permission revoked in browser/OS settings). */
export const clearLocationPermissionGranted = () => remove(GRANTED_KEY);
