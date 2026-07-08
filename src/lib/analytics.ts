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
