import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  recipient_id: string;
  content: string | null;
  image_url: string | null;
  deal_id: string | null;
  read_at: string | null;
  created_at: string;
}

function getConversationId(userA: string, userB: string): string {
  return [userA, userB].sort().join("_");
}

export const useMessages = (userId?: string, friendId?: string) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const conversationId = userId && friendId ? getConversationId(userId, friendId) : null;

  const fetchMessages = useCallback(async () => {
    if (!conversationId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true })
        .limit(100);

      if (error) throw error;
      setMessages((data as Message[]) || []);
    } catch (err) {
      console.error("Error fetching messages:", err);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  // Mark unread messages as read
  const markAsRead = useCallback(async () => {
    if (!userId || !conversationId) return;
    await supabase
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("conversation_id", conversationId)
      .eq("recipient_id", userId)
      .is("read_at", null);
  }, [userId, conversationId]);

  // Send a text message
  const sendMessage = useCallback(
    async (content: string) => {
      if (!userId || !friendId || !conversationId) return;
      const { error } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: userId,
        recipient_id: friendId,
        content,
      });
      if (error) console.error("Error sending message:", error);
    },
    [userId, friendId, conversationId]
  );

  // Send an image message
  const sendImage = useCallback(
    async (file: File) => {
      if (!userId || !friendId || !conversationId) return;
      const path = `${conversationId}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("chat-images")
        .upload(path, file);
      if (uploadError) {
        console.error("Upload error:", uploadError);
        return;
      }
      const { data: urlData } = supabase.storage
        .from("chat-images")
        .getPublicUrl(path);

      await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: userId,
        recipient_id: friendId,
        image_url: urlData.publicUrl,
      });
    },
    [userId, friendId, conversationId]
  );

  // Share a deal
  const shareDeal = useCallback(
    async (dealId: string, dealTitle: string) => {
      if (!userId || !friendId || !conversationId) return;
      await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: userId,
        recipient_id: friendId,
        content: `🔥 Check out this deal: ${dealTitle}`,
        deal_id: dealId,
      });
    },
    [userId, friendId, conversationId]
  );

  // Realtime subscription
  useEffect(() => {
    if (!conversationId) return;
    fetchMessages();

    channelRef.current = supabase
      .channel(`messages:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setMessages((prev) => [...prev, payload.new as Message]);
          } else if (payload.eventType === "UPDATE") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === (payload.new as Message).id
                  ? (payload.new as Message)
                  : m
              )
            );
          } else if (payload.eventType === "DELETE") {
            setMessages((prev) =>
              prev.filter((m) => m.id !== (payload.old as { id: string }).id)
            );
          }
        }
      )
      .subscribe();

    return () => {
      channelRef.current?.unsubscribe();
    };
  }, [conversationId, fetchMessages]);

  // Get unread count for a specific friend
  const getUnreadCount = useCallback(
    (msgs: Message[]) => {
      if (!userId) return 0;
      return msgs.filter((m) => m.recipient_id === userId && !m.read_at).length;
    },
    [userId]
  );

  return {
    messages,
    loading,
    sendMessage,
    sendImage,
    shareDeal,
    markAsRead,
    getUnreadCount,
  };
};

// Hook to get unread counts across all conversations
export const useUnreadCounts = (userId?: string) => {
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!userId) return;

    const fetchCounts = async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("sender_id")
        .eq("recipient_id", userId)
        .is("read_at", null);

      if (error || !data) return;

      const map: Record<string, number> = {};
      data.forEach((m) => {
        map[m.sender_id] = (map[m.sender_id] || 0) + 1;
      });
      setCounts(map);
    };

    fetchCounts();

    const channel = supabase
      .channel(`unread:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `recipient_id=eq.${userId}`,
        },
        () => fetchCounts()
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `recipient_id=eq.${userId}`,
        },
        () => fetchCounts()
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [userId]);

  return counts;
};
