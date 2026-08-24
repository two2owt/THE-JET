import { devLog } from "@/lib/log";
import { useEffect, useId, useMemo, useState } from "react";
import { isDealExpired } from "@/lib/dealExpiry";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import { supabase } from "@/integrations/supabase/client";
import { syncNotificationRead } from "@/lib/notificationRead";
import {
  enqueueRead,
  isReadPending,
  flushPendingReads,
  initNotificationReadQueue,
} from "@/lib/notificationReadQueue";
import {
  isReadLocally,
  markManyReadLocally,
  markReadLocally,
} from "@/lib/notificationReadLedger";
import type { Database } from "@/integrations/supabase/types";

type NotificationLog = Database["public"]["Tables"]["notification_logs"]["Row"];
type DealRow = Database["public"]["Tables"]["deals"]["Row"];

/**
 * The deal fields an alert needs: venue, terms, and the exact end time. Fetched
 * for every alert (expired deals included) so the details modal never depends
 * on the live, active-only deal sync.
 */
export type AlertDeal = Pick<
  DealRow,
  | "id"
  | "title"
  | "description"
  | "deal_type"
  | "venue_id"
  | "venue_name"
  | "venue_address"
  | "starts_at"
  | "expires_at"
  | "active_days"
  | "website_url"
>;


export interface Notification {
  id: string;
  type: "offer" | "trending" | "event";
  title: string;
  message: string;
  venue?: string;
  /** Deal this alert refers to, when known (legacy notification_logs rows) */
  dealId?: string;
  timestamp: string;
  /** Absolute ISO time the alert was sent/delivered */
  sentAt?: string;
  distance?: string;
  read?: boolean;
  /** Where the row came from — decides how mark-as-read is persisted */
  source?: "log" | "delivery";
}

const relativeTime = (iso: string | null | undefined): string => {
  const timeDiff = Date.now() - new Date(iso || "").getTime();
  const minutes = Math.floor(timeDiff / 60000);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "Just now";
};

const CATEGORY_TO_TYPE: Record<string, Notification["type"]> = {
  deal: "offer",
  favorite: "offer",
  trending: "trending",
  event: "event",
};

const mapNotificationLogToNotification = (
  log: NotificationLog,
): Notification => {
  return {
    id: log.id,
    type: log.notification_type as "offer" | "trending" | "event",
    title: log.title,
    message: log.message,
    timestamp: relativeTime(log.sent_at),
    sentAt: log.sent_at ?? undefined,
    read: log.read || isReadPending(log.id) || isReadLocally(log.id) || false,
    dealId: log.deal_id ?? undefined,
    source: "log",
  };
};

export const useNotifications = (enabled: boolean = true) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  // Detail row for every deal referenced by a loaded alert. Alerts whose deal
  // has lapsed are hidden everywhere (list AND badge) without a reload, and the
  // alert details modal reads venue / terms / exact `expires_at` from here —
  // including for expired deals, which the live deal sync no longer carries.
  const [dealById, setDealById] = useState<Record<string, AlertDeal>>({});

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const instanceId = useId();

  const loadNotifications = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        setNotifications([]);
        setLoading(false);
        return;
      }

      const [logsRes, deliveriesRes] = await Promise.all([
        supabase
          .from("notification_logs")
          .select("*")
          .eq("user_id", session.user.id)
          .order("sent_at", { ascending: false })
          .limit(30),
        // Push receipts: what was actually delivered to this user, joined to
        // the queued alert content.
        supabase
          .from("notification_deliveries")
          .select(
            "id, status, opened_at, created_at, queue_id, notification_queue(title, body, category, venue_id, deal_id)",
          )
          .eq("user_id", session.user.id)
          .order("created_at", { ascending: false })
          .limit(30),
      ]);

      if (logsRes.error) throw logsRes.error;

      const fromLogs = (logsRes.data || []).map(
        mapNotificationLogToNotification,
      );

      type DeliveryRow = {
        id: string;
        status: string;
        opened_at: string | null;
        created_at: string;
        queue_id: string;
        notification_queue: {
          title: string;
          body: string;
          category: string;
          venue_id: string | null;
          deal_id: string | null;
        } | null;
      };

      const seen = new Set<string>();
      const fromDeliveries: Notification[] = (
        (deliveriesRes.data as DeliveryRow[] | null) || []
      ).flatMap((delivery) => {
        const queuedNotification = delivery.notification_queue;
        if (!queuedNotification || seen.has(delivery.queue_id)) return [];
        seen.add(delivery.queue_id);
        return [
          {
            id: delivery.id,
            type: CATEGORY_TO_TYPE[queuedNotification.category] ?? "offer",
            title: queuedNotification.title,
            message: queuedNotification.body,
            venue: queuedNotification.venue_id ?? undefined,
            dealId: queuedNotification.deal_id ?? undefined,
            timestamp: relativeTime(delivery.created_at),
            sentAt: delivery.created_at,
            read:
              delivery.status === "opened" ||
              !!delivery.opened_at ||
              isReadPending(delivery.id) ||
              isReadLocally(delivery.id),
            source: "delivery" as const,
            _sortKey: delivery.created_at,
          } as Notification & { _sortKey: string },
        ];
      });

      // Live may briefly trail Test during a schema publish. The legacy
      // notification log remains usable while delivery receipts catch up.
      if (deliveriesRes.error) {
        console.warn(
          "Push delivery receipts are temporarily unavailable:",
          deliveriesRes.error.message,
        );
      }

      const merged = [
        ...fromLogs.map((n, i) => ({
          ...n,
          _sortKey: (logsRes.data || [])[i]?.sent_at ?? "",
        })),
        ...(fromDeliveries as (Notification & { _sortKey: string })[]),
      ]
        .sort((a, b) => (b._sortKey || "").localeCompare(a._sortKey || ""))
        .slice(0, 40)
        .map(({ _sortKey, ...n }) => n);

      setNotifications(merged);

      // One lookup for the deals these alerts point at, so expiry can be
      // enforced client-side on the minute clock (no polling) and the details
      // modal can show venue + terms + exact end time for expired deals too.
      const dealIds = Array.from(
        new Set(merged.map((n) => n.dealId).filter(Boolean) as string[]),
      );
      if (dealIds.length) {
        const { data: dealRows } = await supabase
          .from("deals")
          .select(
            "id, title, description, deal_type, venue_id, venue_name, venue_address, starts_at, expires_at, active_days, website_url",
          )
          .in("id", dealIds);
        const next: Record<string, AlertDeal> = {};
        for (const row of (dealRows ?? []) as AlertDeal[]) next[row.id] = row;
        setDealById(next);
      } else {
        setDealById({});
      }

      setError(null);
    } catch (err) {
      console.error("Error loading notifications:", err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (notificationId: string) => {
    const target = notifications.find((n) => n.id === notificationId);
    if (target?.read) return;
    // Optimistic: the badge and inbox update instantly.
    setNotifications((prev) =>
      prev.map((notif) =>
        notif.id === notificationId ? { ...notif, read: true } : notif,
      ),
    );
    // Remember locally too, so a reload while the write is in flight (or an
    // RLS-dropped update) can't resurrect the alert as new.
    markReadLocally(notificationId);
    // Same idempotent path a push tap uses, so opening a JetCard from the
    // Alerts tab syncs read state everywhere exactly once.
    await syncNotificationRead(notificationId, target?.source);
  };

  const markAllAsRead = async () => {
    const unread = notifications.filter((n) => !n.read);
    if (unread.length === 0) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    markManyReadLocally(unread.map((n) => n.id));
    const logIds = unread
      .filter((n) => n.source !== "delivery")
      .map((n) => n.id);
    const deliveryIds = unread
      .filter((n) => n.source === "delivery")
      .map((n) => n.id);
    try {
      if (logIds.length) {
        const { error } = await supabase
          .from("notification_logs")
          .update({ read: true })
          .in("id", logIds);
        if (error) logIds.forEach((id) => enqueueRead(id, "log"));
      }
      if (deliveryIds.length) {
        const { error } = await supabase
          .from("notification_deliveries")
          .update({ status: "opened", opened_at: new Date().toISOString() })
          .in("id", deliveryIds);
        if (error) deliveryIds.forEach((id) => enqueueRead(id, "delivery"));
      }
    } catch (err) {
      console.error("Error marking all notifications as read:", err);
      // Keep the optimistic state and let the durable queue land the write.
      logIds.forEach((id) => enqueueRead(id, "log"));
      deliveryIds.forEach((id) => enqueueRead(id, "delivery"));
    }
  };

  // Re-evaluate expiry on each minute boundary (shared clock, paused while the
  // tab is hidden). Expired alerts disappear from lists and stop counting
  // toward the unread badge automatically.
  const hasExpiries = Object.values(dealById).some((d) => Boolean(d?.expires_at));
  const now = useMinuteClock(hasExpiries);
  const expiredIds = useMemo(() => {
    const ids = new Set<string>();
    for (const n of notifications) {
      const expiresAt = n.dealId ? dealById[n.dealId]?.expires_at : null;
      if (expiresAt && isDealExpired(expiresAt, now)) ids.add(n.id);
    }
    return ids;
  }, [notifications, dealById, now]);

  const liveNotifications = useMemo(
    () => notifications.filter((n) => !expiredIds.has(n.id)),
    [notifications, expiredIds],
  );
  const expiredNotifications = useMemo(
    () => notifications.filter((n) => expiredIds.has(n.id)),
    [notifications, expiredIds],
  );
  // The badge counts only alerts that are BOTH unread and unexpired. Read state
  // is durable (local ledger + backend), expiry is derived from the deal rows,
  // so this holds across reloads.
  const unreadCount = useMemo(
    () => liveNotifications.filter((n) => !n.read).length,
    [liveNotifications],
  );


  useEffect(() => {
    // Skip initialization if disabled (deferred loading)
    if (!enabled) return;

    // Replay any read-sync writes that failed while offline.
    initNotificationReadQueue();

    // Defer loading notifications slightly to prioritize critical content
    const timer = setTimeout(() => {
      loadNotifications();
    }, 300);

    // Set up real-time subscription
    const channel = supabase
      .channel(`notifications-changes-${instanceId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notification_logs",
        },
        (payload) => {
          devLog("New notification:", payload);
          loadNotifications();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notification_deliveries" },
        () => loadNotifications(),
      )
      .subscribe();

    // Reload when auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      loadNotifications();
    });

    // Foreground push arrived while the app was open — refresh immediately.
    const onPushRefresh = () => loadNotifications();
    window.addEventListener("jet:notifications-refresh", onPushRefresh);
    const onOnline = () => void flushPendingReads();
    window.addEventListener("online", onOnline);

    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
      subscription.unsubscribe();
      window.removeEventListener("jet:notifications-refresh", onPushRefresh);
      window.removeEventListener("online", onOnline);
    };
  }, [enabled, instanceId]);

  return {
    notifications: liveNotifications,
    loading,
    error,
    refresh: loadNotifications,
    markAsRead,
    markAllAsRead,
  };
};
