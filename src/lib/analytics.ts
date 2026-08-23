import { supabase } from "@/integrations/supabase/client";
import { hasConsent } from "@/lib/consent";
import {
  ANALYTICS_EVENTS,
  MESSAGING_EVENT_PREFIXES,
  type AnalyticsEventName,
} from "@/lib/analyticsEvents";


// Generate a simple session ID for grouping events
const getSessionId = (): string => {
  let sessionId = sessionStorage.getItem("analytics_session_id");
  if (!sessionId) {
    sessionId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    sessionStorage.setItem("analytics_session_id", sessionId);
  }
  return sessionId;
};

class Analytics {
  private initialized = false;
  private queue: Array<{
    event_name: string;
    event_data: Record<string, unknown>;
    page_path: string;
  }> = [];
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
        await this.sendEvent(
          event.event_name,
          event.event_data,
          event.page_path,
        );
      }
    }
  }

  private async sendEvent(
    eventName: string,
    eventData: Record<string, unknown> = {},
    pagePath?: string,
  ) {
    try {
      // Resolve the signed-in user at send time. RLS requires
      // `user_id = auth.uid()` for the authenticated role and `user_id IS NULL`
      // for anon, so relying on a cached id set by identify() made every event
      // from a signed-in session fail with 403.
      let userId = this.userId;
      try {
        const { data } = await supabase.auth.getSession();
        userId = data.session?.user?.id ?? null;
        this.userId = userId;
      } catch {
        /* fall back to the cached id */
      }

      // Insert analytics event - using any type since table was just created
      const client = supabase as unknown as {
        from: (table: string) => {
          insert: (
            data: unknown,
          ) => Promise<{ error: { message: string } | null }>;
        };
      };
      const { error } = await client.from("analytics_events").insert({
        event_name: eventName,
        event_data: eventData,
        page_path: pagePath || window.location.pathname,
        session_id: getSessionId(),
        user_id: userId,
      });

      if (error && import.meta.env.DEV) {
        console.warn("Analytics event failed:", error.message);
      }
    } catch (e) {
      // Silently fail - analytics should never break the app
      if (import.meta.env.DEV) {
        console.warn("Analytics error:", e);
      }
    }
  }

  identify(userId: string, traits?: Record<string, unknown>) {
    this.userId = userId;
  }

  track(
    eventName: AnalyticsEventName | string,
    properties?: Record<string, unknown>,
  ) {
    // Runtime guard: messaging-category events require explicit
    // messaging_analytics consent. Silently drop otherwise.
    const category =
      typeof properties?.category === "string"
        ? (properties.category as string)
        : "";
    const isMessaging =
      category === "messaging" ||
      MESSAGING_EVENT_PREFIXES.some((prefix) =>
        eventName.toLowerCase().startsWith(prefix),
      );
    if (isMessaging && !hasConsent("messaging_analytics")) {
      return;
    }

    if (!this.initialized) {
      this.queue.push({
        event_name: eventName,
        event_data: properties || {},
        page_path: window.location.pathname,
      });
      return;
    }
    this.sendEvent(eventName, properties);
  }

  pageView(pageName: string, properties?: Record<string, unknown>) {
    this.track(ANALYTICS_EVENTS.PAGE_VIEW, {
      page: pageName,
      ...properties,
    });
  }

  dealViewed(
    dealId: string,
    dealName: string,
    properties?: Record<string, unknown>,
  ) {
    this.track(ANALYTICS_EVENTS.VIEW_DEAL, {
      deal_id: dealId,
      deal_name: dealName,
      ...properties,
    });
  }

  /**
   * Favouriting is its own funnel step, so it gets its own event name rather
   * than riding on a generic "deal clicked" with an `action` discriminator.
   */
  favoriteDeal(
    venueId: string,
    venueName: string,
    favorited: boolean,
    properties?: Record<string, unknown>,
  ) {
    this.track(
      favorited
        ? ANALYTICS_EVENTS.FAVORITE_DEAL
        : ANALYTICS_EVENTS.UNFAVORITE_DEAL,
      { venue_id: venueId, venue_name: venueName, ...properties },
    );
  }

  shareDeal(
    venueId: string,
    venueName: string,
    properties?: Record<string, unknown>,
  ) {
    this.track(ANALYTICS_EVENTS.SHARE_DEAL, {
      venue_id: venueId,
      venue_name: venueName,
      ...properties,
    });
  }

  getDirections(
    venueId: string,
    venueName: string,
    properties?: Record<string, unknown>,
  ) {
    this.track(ANALYTICS_EVENTS.GET_DIRECTIONS, {
      venue_id: venueId,
      venue_name: venueName,
      ...properties,
    });
  }

  buttonClicked(buttonName: string, location: string) {
    this.track(ANALYTICS_EVENTS.SELECT_CONTENT, {
      button: buttonName,
      location,
    });
  }

  searchPerformed(query: string, resultsCount: number) {
    this.track(ANALYTICS_EVENTS.SEARCH_PERFORMED, {
      query,
      results_count: resultsCount,
    });
  }

  authEvent(event: "signup" | "login" | "logout") {
    const name =
      event === "signup"
        ? ANALYTICS_EVENTS.SIGN_UP
        : event === "login"
          ? ANALYTICS_EVENTS.SIGN_IN
          : ANALYTICS_EVENTS.SIGN_OUT;
    this.track(name);
  }


  reset() {
    this.userId = null;
    sessionStorage.removeItem("analytics_session_id");
  }
}

export const analytics = new Analytics();
