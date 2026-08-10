import { useEffect, useState } from "react";
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
}

const mapNotificationLogToNotification = (log: NotificationLog): Notification => {
  const timeDiff = Date.now() - new Date(log.sent_at || '').getTime();
  const minutes = Math.floor(timeDiff / 60000);
  const hours = Math.floor(minutes / 60);
  
  let timestamp: string;
  if (hours > 0) {
    timestamp = `${hours}h ago`;
  } else if (minutes > 0) {
    timestamp = `${minutes}m ago`;
  } else {
    timestamp = 'Just now';
  }

  return {
    id: log.id,
    type: log.notification_type as "offer" | "trending" | "event",
    title: log.title,
    message: log.message,
    timestamp,
    read: log.read || false
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

      const { data, error: fetchError } = await supabase
        .from('notification_logs')
        .select('*')
        .eq('user_id', session.user.id)
        .order('sent_at', { ascending: false })
        .limit(20);

      if (fetchError) throw fetchError;
      
      const mappedNotifications = (data || []).map(mapNotificationLogToNotification);
      setNotifications(mappedNotifications);
      setError(null);
    } catch (err) {
      console.error('Error loading notifications:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (notificationId: string) => {
    try {
      const { error: updateError } = await supabase
        .from('notification_logs')
        .update({ read: true })
        .eq('id', notificationId);

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

  return { notifications, loading, error, refresh: loadNotifications, markAsRead };
};
