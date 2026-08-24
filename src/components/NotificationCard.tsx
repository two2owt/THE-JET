import { memo, useMemo } from "react";
import { MapPin, Clock, Gift, TrendingUp, Check } from "lucide-react";
import type { DealWithNeighborhood } from "@/mobile-app-snippets/useDealSyncRealtime";
import {
  DealMetaBadges,
  useDealPresentation,
} from "@/components/deals/DealBadges";

export interface Notification {
  id: string;
  type: "offer" | "event" | "trending";
  title: string;
  message: string;
  venue?: string;
  /** Stable venue id, when known. Preferred over the display name for links. */
  venueId?: string;
  /** Deal this alert refers to, when known. */
  dealId?: string;
  timestamp: string;
  sentAt?: string;
  distance?: string;
  read?: boolean;
}

interface NotificationCardProps {
  notification: Notification;
  deals?: DealWithNeighborhood[];
  /** The linked deal has already ended — shown only in the opt-in expired list. */
  expired?: boolean;
  onVenueClick?: (venue: string) => void;
  onRead?: () => void;
  /** Explicit "mark as read" action, independent of opening the venue. */
  onMarkRead?: () => void;
  /** Opens the alert details modal (venue, terms, exact expiry). */
  onShowDetails?: () => void;
}

export const NotificationCard = memo(
  ({
    notification,
    deals,
    expired = false,
    onVenueClick,
    onRead,
    onMarkRead,
    onShowDetails,
  }: NotificationCardProps) => {

    // The deal this alert points at, when it is still live in the synced list.
    const linkedDeal = useMemo(() => {
      if (!notification.dealId || !deals?.length) return null;
      return deals.find((d) => d.id === notification.dealId) ?? null;
    }, [notification.dealId, deals]);

    const enriched = useMemo(() => {
      if (!linkedDeal) return notification;
      return {
        ...notification,
        title: linkedDeal.title || notification.title,
        message: linkedDeal.description || notification.message,
        venue: linkedDeal.venue_name || notification.venue,
        // Prefer the merchant's stable venue id so deep links survive renames
        // and duplicate venue names.
        venueId: linkedDeal.venue_id || notification.venueId,
      };
    }, [notification, linkedDeal]);

    // Deal type / venue category / live countdown all come from the shared
    // presentation layer, so the alert reads exactly like the JetCard and the
    // /deals row for the same merchant deal.
    const presentation = useDealPresentation(linkedDeal);
    const category = presentation?.category ?? null;
    const CategoryIcon = category?.Icon;

    const handleClick = () => {
      const target = enriched.venueId || enriched.venue;
      if (target && onVenueClick) {
        onVenueClick(target);
      }
      if (onRead && !enriched.read) {
        onRead();
      }
    };

    // Tapping any alert is meaningful: it either opens the JetCard or at least
    // marks the alert read.
    const interactive = Boolean(onVenueClick || (onRead && !enriched.read));
    const getIcon = () => {
      // Prefer the linked deal's own category glyph so the alert matches the
      // JetCard / map marker for the same venue.
      if (CategoryIcon) {
        return (
          <CategoryIcon
            className="w-5 h-5"
            style={{ color: category?.dark }}
            aria-hidden="true"
          />
        );
      }
      switch (enriched.type) {
        case "offer":
          return <Gift className="w-5 h-5 text-primary" />;
        case "event":
          return <Clock className="w-5 h-5 text-secondary" />;
        case "trending":
          return <TrendingUp className="w-5 h-5 text-warm" />;
      }
    };

    const getGradient = () => {
      switch (enriched.type) {
        case "offer":
          return "from-primary/10 to-primary-glow/10";
        case "event":
          return "from-secondary/10 to-secondary/10";
        case "trending":
          return "from-warm/10 to-hot/10";
      }
    };

    const absoluteTime = enriched.sentAt
      ? new Date(enriched.sentAt).toLocaleString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      : undefined;

    return (
      <div
        className={`bg-gradient-to-r ${getGradient()} rounded-lg sm:rounded-xl p-3 sm:p-4 border border-border/50 hover-scale transition-all touch-manipulation ${
          interactive ? "cursor-pointer active:scale-[0.98]" : ""
        } ${enriched.read ? "opacity-60" : ""}`}
        onClick={handleClick}
        role={interactive ? "button" : undefined}
        tabIndex={interactive ? 0 : undefined}
        onKeyDown={
          interactive
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleClick();
                }
              }
            : undefined
        }
      >
        <div className="flex items-start gap-2 sm:gap-3">
          <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-primary/10 to-accent/10 rounded-full flex items-center justify-center flex-shrink-0 border border-primary/20 ring-1 ring-primary/10">
            {getIcon()}
          </div>

          <div className="flex-1 min-w-0">
            <h4 className="text-xs sm:text-sm font-bold text-foreground mb-0.5 sm:mb-1">
              {enriched.title}
            </h4>
            <p className="text-[10px] sm:text-xs text-muted-foreground mb-1 sm:mb-2">
              {enriched.message}
            </p>

            <DealMetaBadges
              presentation={presentation}
              className="mb-1 sm:mb-2"
            />


            <div className="flex items-center gap-2 sm:gap-3 text-[10px] sm:text-xs text-muted-foreground">
              {enriched.venue && (
                <div className="flex items-center gap-0.5 sm:gap-1">
                  <MapPin className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                  <span className="truncate">{enriched.venue}</span>
                </div>
              )}

              {enriched.distance && (
                <span className="text-primary font-medium flex-shrink-0">
                  {enriched.distance}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <time
              className="text-[10px] sm:text-xs text-muted-foreground"
              {...(enriched.sentAt ? { dateTime: enriched.sentAt } : {})}
              title={absoluteTime}
            >
              {enriched.timestamp}
            </time>
            {!enriched.read && onMarkRead && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onMarkRead();
                }}
                className="inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/50"
                style={{ width: "28px", height: "28px" }}
                aria-label={`Mark "${enriched.title}" as read`}
                title="Mark as read"
              >
                <Check className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
            {!enriched.read && (
              <span
                className="inline-block rounded-full bg-primary"
                style={{
                  width: "8px",
                  height: "8px",
                  boxShadow: "0 0 6px hsl(var(--primary))",
                }}
                aria-label="Unread"
              />
            )}
          </div>
        </div>
      </div>
    );
  },
);

NotificationCard.displayName = "NotificationCard";
