import { useEffect, useId, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type NotificationLog = Database['public']['Tables']['notification_logs']['Row'];

export interface Notification {
  id: string;
  type: "offer" | "trending" | "event";
  title: string;
  message: string;
  venue?: string;
  timestamp: string;
  distance?: string;
  read?: boolean;
  /** Where the row came from — decides how mark-as-read is persisted */
  source?: "log" | "delivery";
}

const relativeTime = (iso: string | null | undefined): string => {
  const timeDiff = Date.now() - new Date(iso || '').getTime();
  const minutes = Math.floor(timeDiff / 60000);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'Just now';
};

const CATEGORY_TO_TYPE: Record<string, Notification["type"]> = {
  deal: "offer",
  favorite: "offer",
  trending: "trending",
  event: "event",
};

const mapNotificationLogToNotification = (log: NotificationLog): Notification => {
  return {
    id: log.id,
    type: log.notification_type as "offer" | "trending" | "event",
    title: log.title,
    message: log.message,
    timestamp: relativeTime(log.sent_at),
    read: log.read || false,
    source: "log",
  };
};

export const useNotifications = (enabled: boolean = true) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const loadNotifications = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.user) {
        setNotifications([]);
        setLoading(false);
        return;
      }

      const [logsRes, deliveriesRes] = await Promise.all([
        supabase
          .from('notification_logs')
          .select('*')
          .eq('user_id', session.user.id)
          .order('sent_at', { ascending: false })
          .limit(30),
        // Push receipts: what was actually delivered to this user, joined to
        // the queued alert content.
        supabase
          .from('notification_deliveries')
          .select('id, status, opened_at, created_at, queue_id, notification_queue(title, body, category, venue_id)')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false })
          .limit(30),
      ]);

      if (logsRes.error) throw logsRes.error;

      const fromLogs = (logsRes.data || []).map(mapNotificationLogToNotification);

      type DeliveryRow = {
        id: string;
        status: string;
        opened_at: string | null;
        created_at: string;
        queue_id: string;
        notification_queue: {
          title: string; body: string; category: string; venue_id: string | null;
        } | null;
      };

      const seen = new Set<string>();
      const fromDeliveries: Notification[] = ((deliveriesRes.data as DeliveryRow[] | null) || [])
        .flatMap((delivery) => {
          const queuedNotification = delivery.notification_queue;
          if (!queuedNotification || seen.has(delivery.queue_id)) return [];
          seen.add(delivery.queue_id);
          return [{
            id: delivery.id,
            type: CATEGORY_TO_TYPE[queuedNotification.category] ?? "offer",
            title: queuedNotification.title,
            message: queuedNotification.body,
            venue: queuedNotification.venue_id ?? undefined,
            timestamp: relativeTime(delivery.created_at),
            read: delivery.status === 'opened' || !!delivery.opened_at,
            source: "delivery" as const,
            _sortKey: delivery.created_at,
          } as Notification & { _sortKey: string }];
        });

      // Live may briefly trail Test during a schema publish. The legacy
      // notification log remains usable while delivery receipts catch up.
      if (deliveriesRes.error) {
        console.warn('Push delivery receipts are temporarily unavailable:', deliveriesRes.error.message);
      }

      const merged = [
        ...fromLogs.map((n, i) => ({ ...n, _sortKey: (logsRes.data || [])[i]?.sent_at ?? '' })),
        ...(fromDeliveries as (Notification & { _sortKey: string })[]),
      ]
        .sort((a, b) => (b._sortKey || '').localeCompare(a._sortKey || ''))
        .slice(0, 40)
        .map(({ _sortKey, ...n }) => n);

      setNotifications(merged);
      setError(null);
    } catch (err) {
      console.error('Error loading notifications:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (notificationId: string) => {
    const target = notifications.find(n => n.id === notificationId);
    try {
      const updateError = target?.source === 'delivery'
        ? (await supabase
            .from('notification_deliveries')
            .update({ status: 'opened', opened_at: new Date().toISOString() })
            .eq('id', notificationId)).error
        : (await supabase
            .from('notification_logs')
            .update({ read: true })
            .eq('id', notificationId)).error;

      if (updateError) throw updateError;

      setNotifications(prev =>
        prev.map(notif =>
          notif.id === notificationId ? { ...notif, read: true } : notif
        )
      );
    } catch (err) {
      console.error('Error marking notification as read:', err);
    }
  };

  const markAllAsRead = async () => {
    const unread = notifications.filter(n => !n.read);
    if (unread.length === 0) return;
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    const logIds = unread.filter(n => n.source !== 'delivery').map(n => n.id);
    const deliveryIds = unread.filter(n => n.source === 'delivery').map(n => n.id);
    try {
      if (logIds.length) {
        await supabase.from('notification_logs').update({ read: true }).in('id', logIds);
      }
      if (deliveryIds.length) {
        await supabase
          .from('notification_deliveries')
          .update({ status: 'opened', opened_at: new Date().toISOString() })
          .in('id', deliveryIds);
      }
    } catch (err) {
      console.error('Error marking all notifications as read:', err);
    }
  };

  useEffect(() => {
    // Skip initialization if disabled (deferred loading)
    if (!enabled) return;
    
    // Defer loading notifications slightly to prioritize critical content
    const timer = setTimeout(() => {
      loadNotifications();
    }, 300);

    // Set up real-time subscription
    const channel = supabase
      .channel('notifications-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notification_logs'
        },
        (payload) => {
          console.log('New notification:', payload);
          loadNotifications();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notification_deliveries' },
        () => loadNotifications()
      )
      .subscribe();

    // Reload when auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      loadNotifications();
    });

    // Foreground push arrived while the app was open — refresh immediately.
    const onPushRefresh = () => loadNotifications();
    window.addEventListener("jet:notifications-refresh", onPushRefresh);

    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
      subscription.unsubscribe();
      window.removeEventListener("jet:notifications-refresh", onPushRefresh);
    };
  }, [enabled]);

  return { notifications, loading, error, refresh: loadNotifications, markAsRead, markAllAsRead };
};
