import { analytics } from "@/lib/analytics";
import { ANALYTICS_EVENTS } from "@/lib/analyticsEvents";

/** Which permission ask the event belongs to. */
export type PromptPermission = "location" | "push";

/** Routes we report on. Anything else is bucketed as `other`. */
export type PromptRoute = "/" | "/deals" | "other";

const SNOOZE_KEY_PREFIX = "prompt-snooze-count:";

/** Normalise the current pathname to one of the tracked buckets. */
export function promptRoute(pathname?: string): PromptRoute {
  const path =
    pathname ??
    (typeof window !== "undefined" ? window.location.pathname : "other");
  if (path === "/") return "/";
  if (path === "/deals" || path.startsWith("/deals/")) return "/deals";
  return "other";
}

/** Total number of times this permission has been snoozed on this device. */
export function getSnoozeCount(permission: PromptPermission): number {
  if (typeof localStorage === "undefined") return 0;
  const raw = localStorage.getItem(`${SNOOZE_KEY_PREFIX}${permission}`);
  const n = raw ? parseInt(raw, 10) : 0;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function bumpSnoozeCount(permission: PromptPermission): number {
  const next = getSnoozeCount(permission) + 1;
  try {
    localStorage.setItem(`${SNOOZE_KEY_PREFIX}${permission}`, String(next));
  } catch {
    /* storage disabled — the event still reports the in-memory value */
  }
  return next;
}

type Extra = Record<string, unknown>;

function base(permission: PromptPermission, extra?: Extra) {
  return {
    permission,
    route: promptRoute(),
    snooze_count: getSnoozeCount(permission),
    ...extra,
  };
}

/** The prompt dialog became visible to the user. */
export function trackPromptImpression(
  permission: PromptPermission,
  extra?: Extra,
) {
  analytics.track(ANALYTICS_EVENTS.PERMISSION_PROMPT_SHOWN, base(permission, extra));
}

/** The user granted the permission from this prompt. */
export function trackPromptAccepted(
  permission: PromptPermission,
  extra?: Extra,
) {
  analytics.track(
    ANALYTICS_EVENTS.PERMISSION_PROMPT_ACCEPTED,
    base(permission, extra),
  );
}

/** The user (or the browser) denied the permission from this prompt. */
export function trackPromptDenied(permission: PromptPermission, extra?: Extra) {
  analytics.track(
    ANALYTICS_EVENTS.PERMISSION_PROMPT_DENIED,
    base(permission, extra),
  );
}

/** The user dismissed / postponed the ask. Increments the snooze counter. */
export function trackPromptSnoozed(
  permission: PromptPermission,
  extra?: Extra,
) {
  const snooze_count = bumpSnoozeCount(permission);
  analytics.track(ANALYTICS_EVENTS.PERMISSION_PROMPT_SNOOZED, {
    ...base(permission, extra),
    snooze_count,
  });
}
