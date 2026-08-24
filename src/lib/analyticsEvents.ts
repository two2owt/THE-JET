/**
 * Canonical GTM funnel event names.
 *
 * Every analytics event in the app MUST use one of these constants. The names
 * are snake_case because that is what the downstream GTM / warehouse funnel
 * expects — the previous Title Case names (`Deal Clicked`, `Auth Event`, ...)
 * could not be mapped to funnel steps without a lookup table, and pushing the
 * real action into an `event_data.action` field meant a single event name
 * covered several distinct funnel steps.
 *
 * Rules:
 * - One event name per funnel step. Never overload a name with an `action`
 *   discriminator; add a new constant instead.
 * - Names are stable identifiers. Renaming one breaks historical reporting, so
 *   treat this file as an append-mostly contract.
 * - Property keys are snake_case for the same reason.
 */
export const ANALYTICS_EVENTS = {
  // --- Acquisition ---------------------------------------------------------
  PAGE_VIEW: "page_view",

  // --- Activation ----------------------------------------------------------
  SIGN_UP: "sign_up",
  SIGN_IN: "sign_in",
  SIGN_OUT: "sign_out",

  // --- Discovery -----------------------------------------------------------
  SEARCH_PERFORMED: "search_performed",
  VIEW_DEAL: "view_deal",

  // --- Engagement ----------------------------------------------------------
  FAVORITE_DEAL: "favorite_deal",
  UNFAVORITE_DEAL: "unfavorite_deal",
  SHARE_DEAL: "share_deal",
  GET_DIRECTIONS: "get_directions",
  SELECT_CONTENT: "select_content",

  // --- Monetization --------------------------------------------------------
  UPGRADE_PROMPT_SHOWN: "upgrade_prompt_shown",
  BEGIN_CHECKOUT: "begin_checkout",
  CHECKOUT_FAILED: "checkout_failed",
  SUBSCRIPTION_ACTIVE: "subscription_active",

  // --- Permission priming --------------------------------------------------
  PERMISSION_PROMPT_SHOWN: "permission_prompt_shown",
  PERMISSION_PROMPT_ACCEPTED: "permission_prompt_accepted",
  PERMISSION_PROMPT_DENIED: "permission_prompt_denied",
  PERMISSION_PROMPT_SNOOZED: "permission_prompt_snoozed",

  // --- Distribution --------------------------------------------------------
  DEEP_LINK_SHARED: "deep_link_shared",
  DEEP_LINK_OPENED: "deep_link_opened",
  DEEP_LINK_FALLBACK: "deep_link_fallback",
  DEEP_LINK_FAILED: "deep_link_failed",
} as const;

export type AnalyticsEventName =
  (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

/**
 * The ordered conversion funnel. Exported so dashboards and tests can assert
 * against one source of truth instead of hardcoding strings.
 */
export const GTM_FUNNEL_STEPS: readonly AnalyticsEventName[] = [
  ANALYTICS_EVENTS.PAGE_VIEW,
  ANALYTICS_EVENTS.SIGN_UP,
  ANALYTICS_EVENTS.VIEW_DEAL,
  ANALYTICS_EVENTS.FAVORITE_DEAL,
  ANALYTICS_EVENTS.SHARE_DEAL,
  ANALYTICS_EVENTS.BEGIN_CHECKOUT,
  ANALYTICS_EVENTS.SUBSCRIPTION_ACTIVE,
] as const;

/**
 * Events that carry messaging data and therefore require explicit
 * `messaging_analytics` consent before they may be recorded.
 */
export const MESSAGING_EVENT_PREFIXES = [
  "message_",
  "chat_",
  "conversation_",
] as const;
