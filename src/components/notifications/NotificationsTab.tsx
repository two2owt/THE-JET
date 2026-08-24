import { lazy, Suspense } from "react";
import { usePersistentViewState } from "@/hooks/usePersistentViewState";
import { Bell } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { TabPageHeader } from "@/components/TabPageHeader";
import type { Venue } from "@/types/venue";

const NotificationCard = lazy(() =>
  import("@/components/NotificationCard").then((m) => ({
    default: m.NotificationCard,
  })),
);

type Filter = "all" | "unread" | "read";

interface NotificationsTabProps {
  notifications: any[];
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  onVenueClick: (venue: Venue | string) => void;
}

/**
 * Alerts tab: filter chips (all / unread / read), bulk mark-as-read, and the
 * notification list. Filter state is local to the tab; the notification data
 * itself stays owned by `useNotifications` in the page.
 */
export function NotificationsTab({
  notifications,
  markAsRead,
  markAllAsRead,
  onVenueClick,
}: NotificationsTabProps) {
  const [filter, setFilter] = usePersistentViewState<Filter>(
    "alerts:filter",
    "all",
  );

  const unreadCount = notifications.filter((n) => !n.read).length;
  const readCount = notifications.length - unreadCount;
  const visible =
    filter === "unread"
      ? notifications.filter((n) => !n.read)
      : filter === "read"
        ? notifications.filter((n) => n.read)
        : notifications;

  return (
    <PageShell>
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

      {visible.length === 0 ? (
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
                onVenueClick={onVenueClick}
                onRead={() => markAsRead(notification.id)}
              />
            </Suspense>
          </div>
        ))
      )}
    </PageShell>
  );
}
