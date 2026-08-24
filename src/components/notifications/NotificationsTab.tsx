import { lazy, Suspense, useMemo, useState } from "react";
import { isDealExpired } from "@/lib/dealExpiry";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import { usePersistentViewState } from "@/hooks/usePersistentViewState";

import { Bell, History } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { TabPageHeader } from "@/components/TabPageHeader";
import { EmailVerificationBanner } from "@/components/auth/EmailVerificationBanner";
import {
  AlertDetailsDialog,
  type AlertDetailsTarget,
} from "@/components/notifications/AlertDetailsDialog";
import type { AlertDeal } from "@/hooks/useNotifications";
import type { Venue } from "@/types/venue";
import type { DealWithNeighborhood } from "@/mobile-app-snippets/useDealSyncRealtime";

const NotificationCard = lazy(() =>
  import("@/components/NotificationCard").then((m) => ({
    default: m.NotificationCard,
  })),
);

type Filter = "all" | "unread" | "read";

interface NotificationsTabProps {
  notifications: any[];
  /** Alerts whose linked deal has already ended (shown only when toggled on). */
  expiredNotifications?: any[];
  /** Deal rows keyed by id — powers the details modal, expired deals included. */
  dealById?: Record<string, AlertDeal>;
  deals?: DealWithNeighborhood[];
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  onVenueClick: (venue: Venue | string) => void;
}

/**
 * Alerts tab: filter chips (all / unread / read), an opt-in "expired" toggle,
 * bulk mark-as-read, the notification list, and the alert details modal. Filter
 * state is local to the tab; the notification data itself stays owned by
 * `useNotifications` in the page.
 */
export function NotificationsTab({
  notifications,
  expiredNotifications = [],
  dealById = {},
  deals,
  markAsRead,
  markAllAsRead,
  onVenueClick,
}: NotificationsTabProps) {
  const [filter, setFilter] = usePersistentViewState<Filter>(
    "alerts:filter",
    "all",
  );
  const [showExpired, setShowExpired] = usePersistentViewState<boolean>(
    "alerts:showExpired",
    false,
  );
  const [detailsFor, setDetailsFor] = useState<AlertDetailsTarget | null>(null);


  // Re-evaluate expiry on each minute boundary (shared app-wide clock, paused
  // while the tab is hidden) so an alert drops off without a reload.
  const hasExpiries = useMemo(
    () =>
      (deals ?? []).some((d) => Boolean(d?.expires_at)) ||
      Object.values(dealById).some((d) => Boolean(d?.expires_at)),
    [deals, dealById],
  );
  const now = useMinuteClock(hasExpiries);

  // Expiry / terms come from `dealById` (every alert's deal, expired included)
  // and fall back to the live active-only deal sync.
  const expiresAtOf = useMemo(() => {
    const syncedById = new Map((deals ?? []).map((d) => [d.id, d]));
    return (n: { dealId?: string }): string | null => {
      if (!n?.dealId) return null;
      return (
        dealById[n.dealId]?.expires_at ??
        syncedById.get(n.dealId)?.expires_at ??
        null
      );
    };
  }, [deals, dealById]);

  // Alerts tied to a deal that has passed its merchant `expires_at` are removed
  // outright. Alerts with no linked deal (or an unknown deal) are left alone —
  // we can't prove those are stale.
  //
  // Ordering is urgency-first: alerts whose deal expires soonest come first, so
  // the thing about to lapse is at the top. Alerts with no known expiry sort
  // after those, newest first, and sent time breaks any tie.
  const sortAlerts = useMemo(() => {
    const timeOf = (n: { dealId?: string }): number | null => {
      const at = expiresAtOf(n);
      if (!at) return null;
      const ms = new Date(at).getTime();
      return Number.isFinite(ms) ? ms : null;
    };
    const sentOf = (n: { sentAt?: string }): number => {
      const at = n?.sentAt ? new Date(n.sentAt).getTime() : NaN;
      return Number.isFinite(at) ? at : 0;
    };
    return (rows: any[]) =>
      [...rows].sort((a, b) => {
        const ea = timeOf(a);
        const eb = timeOf(b);
        if (ea !== null && eb !== null && ea !== eb) return ea - eb;
        if (ea !== null && eb === null) return -1;
        if (ea === null && eb !== null) return 1;
        return sentOf(b) - sentOf(a);
      });
  }, [expiresAtOf]);

  const live = useMemo(
    () =>
      sortAlerts(
        notifications.filter((n) => {
          const at = expiresAtOf(n);
          return at ? !isDealExpired(at, now) : true;
        }),
      ),
    [notifications, expiresAtOf, sortAlerts, now],
  );

  // Expired alerts are reviewable but never counted: most recently ended first.
  const expired = useMemo(() => {
    const endedOf = (n: any) => {
      const at = expiresAtOf(n);
      const ms = at ? new Date(at).getTime() : NaN;
      return Number.isFinite(ms) ? ms : 0;
    };
    const fromLive = notifications.filter((n) => {
      const at = expiresAtOf(n);
      return at ? isDealExpired(at, now) : false;
    });
    const byId = new Map<string, any>();
    for (const n of [...expiredNotifications, ...fromLive]) byId.set(n.id, n);
    return [...byId.values()].sort((a, b) => endedOf(b) - endedOf(a));
  }, [expiredNotifications, notifications, expiresAtOf, now]);

  // The badge and the chip counts only ever describe unexpired alerts.
  const unreadCount = live.filter((n) => !n.read).length;
  const readCount = live.length - unreadCount;

  const matchesFilter = (n: any) =>
    filter === "unread" ? !n.read : filter === "read" ? n.read : true;

  const visibleLive = live.filter(matchesFilter);
  const visibleExpired = showExpired ? expired.filter(matchesFilter) : [];
  const visibleCount = visibleLive.length + visibleExpired.length;

  const renderCard = (notification: any, isExpired: boolean) => (
    <div
      key={notification.id}
      className={isExpired ? "opacity-70" : undefined}
    >
      <Suspense fallback={null}>
        <NotificationCard
          notification={notification}
          deals={deals}
          expired={isExpired}
          expiresAt={expiresAtOf(notification)}
          onVenueClick={onVenueClick}
          onRead={() => markAsRead(notification.id)}
          onMarkRead={() => markAsRead(notification.id)}
          onShowDetails={() => setDetailsFor(notification)}
        />
      </Suspense>
    </div>
  );

  return (
    <PageShell>
      <EmailVerificationBanner />
      <TabPageHeader

        title="Notifications"
        subtitle="Stay updated with nearby deals and events"
        badge={
          unreadCount > 0 ? (
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold leading-none"
              style={{
                background: "hsl(var(--destructive) / 0.15)",
                border: "1px solid hsl(var(--destructive) / 0.4)",
                color: "hsl(var(--destructive))",
                boxShadow: "0 0 8px hsl(var(--destructive) / 0.2)",
              }}
              aria-label={`${unreadCount} unread notifications`}
            >
              <span
                className="inline-block rounded-full"
                style={{
                  width: "6px",
                  height: "6px",
                  background: "hsl(var(--destructive))",
                  boxShadow: "0 0 6px hsl(var(--destructive))",
                }}
                aria-hidden="true"
              />
              {unreadCount} unread
            </span>
          ) : null
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div
          role="group"
          aria-label="Filter notifications"
          className="flex items-center gap-1 rounded-full p-1"
          style={{
            background: "hsl(var(--muted) / 0.4)",
            border: "1px solid hsl(var(--border) / 0.5)",
          }}
        >
          {(["all", "unread", "read"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setFilter(mode)}
              aria-pressed={filter === mode}
              className={`text-xs font-semibold rounded-full px-3 py-1 transition-colors ${
                filter === mode
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {mode === "all"
                ? "All"
                : mode === "unread"
                  ? `Unread${unreadCount > 0 ? ` (${unreadCount})` : ""}`
                  : `Read${readCount > 0 ? ` (${readCount})` : ""}`}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {expired.length > 0 && (
            <button
              type="button"
              onClick={() => setShowExpired((v) => !v)}
              aria-pressed={showExpired}
              className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-2.5 py-1.5 transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/50"
              style={{
                minHeight: "32px",
                background: showExpired
                  ? "hsl(var(--muted) / 0.7)"
                  : "transparent",
                border: "1px solid hsl(var(--border) / 0.6)",
                color: showExpired
                  ? "hsl(var(--foreground))"
                  : "hsl(var(--muted-foreground))",
              }}
            >
              <History className="w-3.5 h-3.5" aria-hidden="true" />
              {showExpired ? "Hide" : "Show"} expired ({expired.length})
            </button>
          )}
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllAsRead}
              className="text-xs font-semibold text-primary hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/50 rounded-md px-2 py-1"
              aria-label="Mark all notifications as read"
            >
              Mark all as read
            </button>
          )}
        </div>
      </div>

      {visibleCount === 0 ? (

        <div
          className="text-center rounded-2xl"
          style={{
            padding: "48px 16px",
            background: "hsl(var(--card) / 0.9)",
            border: "1px solid hsl(var(--border) / 0.5)",
          }}
        >
          <div
            className="w-14 h-14 mx-auto mb-4 rounded-full flex items-center justify-center"
            style={{
              background:
                "linear-gradient(135deg, hsl(var(--primary) / 0.15), hsl(var(--accent) / 0.15))",
              border: "1px solid hsl(var(--primary) / 0.2)",
            }}
          >
            <Bell
              className="w-6 h-6"
              style={{ color: "hsl(var(--primary))" }}
            />
          </div>
          <p className="text-base font-semibold text-foreground mb-1.5">
            {filter === "unread"
              ? "You're all caught up"
              : filter === "read"
                ? "No read notifications"
                : "No notifications yet"}
          </p>
          <p className="text-[13px] text-muted-foreground">
            {filter === "unread"
              ? "Every alert has been read"
              : filter === "read"
                ? "Alerts you open will show up here"
                : "Enable location tracking to receive deal alerts"}
          </p>
        </div>
      ) : (
        visible.map((notification) => (
          <div key={notification.id}>
            <Suspense fallback={null}>
              <NotificationCard
                notification={notification}
                deals={deals}
                onVenueClick={onVenueClick}
                onRead={() => markAsRead(notification.id)}
                onMarkRead={() => markAsRead(notification.id)}
              />
            </Suspense>
          </div>
        ))
      )}
    </PageShell>
  );
}
