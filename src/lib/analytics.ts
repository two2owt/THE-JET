import { supabase } from "@/integrations/supabase/client";
import { hasConsent } from "@/lib/consent";

// GTM dataLayer bridge — every tracked event is mirrored into window.dataLayer
// so GTM tags/triggers see the same stream as Supabase analytics_events.
// Safe to call before GTM loads: the array is initialized on first push and
// GTM will replay historical entries when its container script mounts.
type DataLayerEvent = Record<string, unknown> & { event: string };
declare global {
  interface Window {
    dataLayer?: DataLayerEvent[];
  }
}

const pushToDataLayer = (
  eventName: string,
  properties: Record<string, unknown>,
  userId: string | null,
  sessionId: string,
  pagePath: string,
) => {
  if (typeof window === "undefined") return;
  try {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: eventName,
      event_name: eventName,
      user_id: userId,
      session_id: sessionId,
      page_path: pagePath,
      ...properties,
    });
  } catch {
    // dataLayer push must never break the app
  }
};

// Generate a simple session ID for grouping events
const getSessionId = (): string => {
  let sessionId = sessionStorage.getItem('analytics_session_id');
  if (!sessionId) {
    sessionId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    sessionStorage.setItem('analytics_session_id', sessionId);
  }
  return sessionId;
};

// ---------------------------------------------------------------------------
// UTM attribution
//
// - First-touch attribution is persisted in localStorage forever (until reset)
//   so we can attribute conversions to the original acquisition channel.
// - Last-touch attribution is persisted in sessionStorage so we can attribute
//   in-session behavior to the most recent campaign that brought the user in.
// - Both are merged into every analytics event under `utm_*` and `first_utm_*`
//   keys so GTM/GA4 and Supabase reporting see the same attribution.
// ---------------------------------------------------------------------------
const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "fbclid",
] as const;
type UtmKey = (typeof UTM_KEYS)[number];
type UtmData = Partial<Record<UtmKey, string>> & { referrer?: string; landing_page?: string; captured_at?: string };

const FIRST_TOUCH_KEY = "jet_utm_first_touch";
const LAST_TOUCH_KEY = "jet_utm_last_touch";

const readUtmFromUrl = (): UtmData | null => {
  if (typeof window === "undefined") return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const found: UtmData = {};
    let hasAny = false;
    for (const key of UTM_KEYS) {
      const value = params.get(key);
      if (value) {
        found[key] = value;
        hasAny = true;
      }
    }
    if (!hasAny) return null;
    found.referrer = document.referrer || undefined;
    found.landing_page = window.location.pathname + window.location.search;
    found.captured_at = new Date().toISOString();
    return found;
  } catch {
    return null;
  }
};

const readStoredUtm = (storage: Storage | undefined, key: string): UtmData | null => {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as UtmData) : null;
  } catch {
    return null;
  }
};

/**
 * Capture UTM parameters from the URL exactly once per visit.
 * - First-touch is written only if no prior first-touch exists.
 * - Last-touch is overwritten on every campaign visit.
 * Idempotent and safe to call multiple times.
 */
export const captureUtmParams = (): void => {
  if (typeof window === "undefined") return;
  const incoming = readUtmFromUrl();
  if (!incoming) return;
  try {
    if (!localStorage.getItem(FIRST_TOUCH_KEY)) {
      localStorage.setItem(FIRST_TOUCH_KEY, JSON.stringify(incoming));
    }
    sessionStorage.setItem(LAST_TOUCH_KEY, JSON.stringify(incoming));
  } catch {
    // storage may be unavailable (private mode / quota) — best-effort
  }
};

/**
 * Returns the attribution payload merged into every tracked event.
 * Last-touch fields are top-level (utm_*), first-touch is namespaced
 * (first_utm_*) so GTM tags can pick whichever attribution model they need.
 */
const getAttributionPayload = (): Record<string, unknown> => {
  const last = readStoredUtm(typeof sessionStorage !== "undefined" ? sessionStorage : undefined, LAST_TOUCH_KEY);
  const first = readStoredUtm(typeof localStorage !== "undefined" ? localStorage : undefined, FIRST_TOUCH_KEY);
  const out: Record<string, unknown> = {};
  if (last) {
    for (const key of UTM_KEYS) if (last[key]) out[key] = last[key];
    if (last.referrer) out.referrer = last.referrer;
    if (last.landing_page) out.landing_page = last.landing_page;
  }
  if (first) {
    for (const key of UTM_KEYS) if (first[key]) out[`first_${key}`] = first[key];
    if (first.landing_page) out.first_landing_page = first.landing_page;
    if (first.captured_at) out.first_touch_at = first.captured_at;
  }
  return out;
};

class Analytics {
  private initialized = false;
  private queue: Array<{ event_name: string; event_data: Record<string, unknown>; page_path: string }> = [];
  private userId: string | null = null;

  init() {
    if (!this.initialized) {
      this.initialized = true;
      // Process any queued events
      this.processQueue();
    }
  }

  private async processQueue() {
    while (this.queue.length > 0) {
      const event = this.queue.shift();
      if (event) {
        await this.sendEvent(event.event_name, event.event_data, event.page_path);
      }
    }
  }

  private async sendEvent(eventName: string, eventData: Record<string, unknown> = {}, pagePath?: string) {
    try {
      // Insert analytics event - using any type since table was just created
      const client = supabase as unknown as { from: (table: string) => { insert: (data: unknown) => Promise<{ error: { message: string } | null }> } };
      const { error } = await client.from('analytics_events').insert({
        event_name: eventName,
        event_data: eventData,
        page_path: pagePath || window.location.pathname,
        session_id: getSessionId(),
        user_id: this.userId,
      });
      
      if (error && import.meta.env.DEV) {
        console.warn('Analytics event failed:', error.message);
      }
    } catch (e) {
      // Silently fail - analytics should never break the app
      if (import.meta.env.DEV) {
        console.warn('Analytics error:', e);
      }
    }
  }

  identify(userId: string, traits?: Record<string, unknown>) {
    this.userId = userId;
    pushToDataLayer(
      "analytics_identify",
      { ...(traits || {}) },
      userId,
      getSessionId(),
      typeof window !== "undefined" ? window.location.pathname : "/",
    );
    if (traits) {
      this.track("User Identified", traits);
    }
  }

  track(eventName: string, properties?: Record<string, unknown>) {
    // Runtime guard: messaging-category events require explicit
    // messaging_analytics consent. Silently drop otherwise.
    const category =
      typeof properties?.category === "string" ? (properties.category as string) : "";
    const isMessaging =
      category === "messaging" ||
      /^(Message|Chat|Conversation)\b/i.test(eventName);
    if (isMessaging && !hasConsent("messaging_analytics")) {
      return;
    }

    // Mirror to GTM dataLayer regardless of Supabase init state so
    // pre-init events are still visible to GTM tags.
    pushToDataLayer(
      eventName,
      properties || {},
      this.userId,
      getSessionId(),
      window.location.pathname,
    );

    if (!this.initialized) {
      this.queue.push({ event_name: eventName, event_data: properties || {}, page_path: window.location.pathname });
      return;
    }
    this.sendEvent(eventName, properties);
  }

  pageView(pageName: string, properties?: Record<string, unknown>) {
    this.track("Page Viewed", {
      page: pageName,
      ...properties,
    });
  }

  dealViewed(dealId: string, dealName: string, properties?: Record<string, unknown>) {
    this.track("Deal Viewed", {
      deal_id: dealId,
      deal_name: dealName,
      ...properties,
    });
  }

  dealClicked(dealId: string, dealName: string, action: string) {
    this.track("Deal Clicked", {
      deal_id: dealId,
      deal_name: dealName,
      action,
    });
  }

  buttonClicked(buttonName: string, location: string) {
    this.track("Button Clicked", {
      button: buttonName,
      location,
    });
  }

  searchPerformed(query: string, resultsCount: number) {
    this.track("Search Performed", {
      query,
      results_count: resultsCount,
    });
  }

  authEvent(event: "signup" | "login" | "logout") {
    this.track("Auth Event", {
      event,
    });
  }

  reset() {
    // Signal identity reset to GTM so downstream tags (GA4, Ads) can clear
    // user-scoped state.
    pushToDataLayer("analytics_reset", {}, null, getSessionId(), window.location.pathname);
    this.userId = null;
    sessionStorage.removeItem('analytics_session_id');
  }
}

export const analytics = new Analytics();
