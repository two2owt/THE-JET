import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Tracks unread direct-message count for the current user and shows
 * an in-app toast when a new message arrives while the user is not
 * already viewing that conversation.
 *
 * Intended to be mounted ONCE near the app root.
 */
export function useUnreadMessages() {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const navigate = useNavigate();
  const location = useLocation();
  const [unreadCount, setUnreadCount] = useState(0);
  const locationRef = useRef(location);
  locationRef.current = location;

  const refresh = useCallback(async () => {
    if (!userId) {
      setUnreadCount(0);
      return;
    }
    const { count } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", userId)
      .is("read_at", null);
    setUnreadCount(count || 0);
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setUnreadCount(0);
      return;
    }
    refresh();

    const channel = supabase
      .channel(`unread-messages:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `recipient_id=eq.${userId}`,
        },
        async (payload) => {
          const msg = payload.new as {
            id: string;
            sender_id: string;
            content: string | null;
            image_url: string | null;
            conversation_id: string;
          };

          // Don't toast if user is actively in /messages with this friend open.
          const onMessagesPage = locationRef.current.pathname.startsWith("/messages");
          const openFriend = new URLSearchParams(locationRef.current.search).get("friend");
          const isViewingThisChat = onMessagesPage && openFriend === msg.sender_id;

          if (!isViewingThisChat) {
            // Look up sender display name for the toast
            const { data: profile } = await supabase
              .from("profiles_secure")
              .select("display_name, avatar_url")
              .eq("id", msg.sender_id)
              .maybeSingle();

            const senderName = profile?.display_name || "New message";
            const preview = msg.image_url
              ? "📷 Sent a photo"
              : (msg.content || "").slice(0, 80);

            toast(senderName, {
              description: preview,
              action: {
                label: "Open",
                onClick: () =>
                  navigate(`/messages?friend=${msg.sender_id}`),
              },
            });
          }

          refresh();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `recipient_id=eq.${userId}`,
        },
        () => refresh()
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [userId, refresh, navigate]);

  return { unreadCount, refresh };
}
