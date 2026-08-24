import { useState, useEffect, useCallback, useId, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfilePulse } from "@/hooks/useProfilePulse";

export interface Conversation {
  friendId: string;
  friendName: string;
  friendAvatar: string | null;
  lastMessage: string | null;
  lastMessageAt: string;
  unreadCount: number;
}

/**
 * Fetches a list of conversations for the current user,
 * derived from their accepted connections + latest messages.
 */
export const useConversations = (userId?: string) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const rtId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [loading, setLoading] = useState(true);

  const fetchConversations = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // 1. Get accepted connections
      const { data: connections, error: connError } = await supabase
        .from("user_connections")
        .select("*")
        .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
        .eq("status", "accepted");

      if (connError) throw connError;
      if (!connections?.length) {
        setConversations([]);
        return;
      }

      const friendIds = connections.map((c) =>
        c.user_id === userId ? c.friend_id : c.user_id,
      );

      // 2. Get profiles
      const { data: profiles } = await supabase
        .from("profiles_secure")
        .select("id, display_name, avatar_url")
        .in("id", friendIds);

      const profileMap = (profiles || []).reduce(
        (acc, p) => {
          acc[p.id!] = p;
          return acc;
        },
        {} as Record<
          string,
          {
            id: string | null;
            display_name: string | null;
            avatar_url: string | null;
          }
        >,
      );

      // 3. For each friend, get latest message and unread count
      const convos: Conversation[] = [];

      for (const fid of friendIds) {
        const convId = [userId, fid].sort().join("_");

        // Latest message
        const { data: lastMsgs } = await supabase
          .from("messages")
          .select("content, created_at, image_url")
          .eq("conversation_id", convId)
          .order("created_at", { ascending: false })
          .limit(1);

        // Unread count
        const { count } = await supabase
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("conversation_id", convId)
          .eq("recipient_id", userId)
          .is("read_at", null);

        const lastMsg = lastMsgs?.[0];

        convos.push({
          friendId: fid,
          friendName: profileMap[fid]?.display_name || "Friend",
          friendAvatar: profileMap[fid]?.avatar_url || null,
          lastMessage: lastMsg
            ? lastMsg.image_url
              ? "📷 Photo"
              : lastMsg.content
            : null,
          lastMessageAt: lastMsg?.created_at || "",
          unreadCount: count || 0,
        });
      }

      // Sort: conversations with messages first (most recent on top), then alphabetical
      convos.sort((a, b) => {
        if (a.lastMessageAt && b.lastMessageAt)
          return (
            new Date(b.lastMessageAt).getTime() -
            new Date(a.lastMessageAt).getTime()
          );
        if (a.lastMessageAt) return -1;
        if (b.lastMessageAt) return 1;
        return a.friendName.localeCompare(b.friendName);
      });

      setConversations(convos);
    } catch (err) {
      console.error("Error fetching conversations:", err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Instant refresh when a friend edits their profile (name/avatar).
  useProfilePulse(() => fetchConversationsRef.current?.(), !!userId);

  const fetchConversationsRef = useRef(fetchConversations);
  fetchConversationsRef.current = fetchConversations;

  useEffect(() => {
    fetchConversations();

    if (!userId) return;

    // Realtime: refresh list on any new/updated message involving this user
    const channel = supabase
      .channel(`conversations:${userId}:${rtId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
        },
        (payload) => {
          const msg = (payload.new || payload.old) as {
            sender_id?: string;
            recipient_id?: string;
          };
          if (msg?.sender_id === userId || msg?.recipient_id === userId) {
            fetchConversations();
          }
        },
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [userId, fetchConversations]);

  return { conversations, loading, refresh: fetchConversations };
};
