import { memo, useEffect, useMemo, useState } from "react";
import { MapPin, Clock, Gift, TrendingUp } from "lucide-react";
import type { DealWithNeighborhood } from "@/mobile-app-snippets/useDealSyncRealtime";
import { resolveDealCategory } from "@/lib/dealCategory";
import { getDealExpiry } from "@/lib/dealExpiry";

export interface Notification {
  id: string;
  type: "offer" | "event" | "trending";
  title: string;
  message: string;
  venue?: string;
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
  onVenueClick?: (venue: string) => void;
  onRead?: () => void;
}

export const NotificationCard = memo(
  ({ notification, deals, onVenueClick, onRead }: NotificationCardProps) => {
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
      };
    }, [notification, linkedDeal]);

    // Deal type / venue category / live countdown all come from the shared
    // presentation layer, so the alert reads exactly like the JetCard and the
    // /deals row for the same merchant deal.
    const presentation = useDealPresentation(linkedDeal);
    const category = presentation?.category ?? null;
    const CategoryIcon = category?.Icon;

    const handleClick = () => {
      if (enriched.venue && onVenueClick) {
        onVenueClick(enriched.venue);
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

    {(dealType || category || expiry) && (
              <div className="flex flex-wrap items-center gap-1 mb-1 sm:mb-2">
                {dealType && (
                  <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[9px] sm:text-[10px] font-semibold uppercase tracking-wide text-primary">
                    {dealType}
                  </span>
                )}
                {category && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] sm:text-[10px] font-medium"
                    style={{
                      color: category.dark,
                      borderColor: `${category.dark}55`,
                      backgroundColor: `${category.dark}1a`,
                    }}
                  >
                    <category.Icon className="w-2.5 h-2.5" aria-hidden="true" />
                    {category.label}
                  </span>
                )}
                {expiry && (
                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] sm:text-[10px] font-semibold ${
                      expiry.expired
                        ? "border-destructive/40 bg-destructive/10 text-destructive"
                        : "border-warm/40 bg-warm/10 text-warm"
                    }`}
                  >
                    <Clock className="w-2.5 h-2.5" aria-hidden="true" />
                    {expiry.expired ? "Expired" : `Expires in ${expiry.label.replace(" left", "")}`}
                  </span>
                )}
              </div>
            )}


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
