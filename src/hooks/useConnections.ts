import { useState, useEffect, useRef } from "react";
import { useProfilePulse } from "@/hooks/useProfilePulse";
import { supabase } from "@/integrations/supabase/client";
import { isRlsViolation, withRlsRetry } from "@/lib/rlsRetry";


interface Profile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface Connection {
  id: string;
  user_id: string;
  friend_id: string;
  status: "pending" | "accepted" | "blocked";
  created_at: string;
  updated_at: string;
  profile?: Profile;
}

export const useConnections = (userId?: string) => {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [pendingRequests, setPendingRequests] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (userId) {
      fetchConnections();
    } else {
      setLoading(false);
    }
  }, [userId]);

  // Friends' names/avatars come from their profile rows, so refresh the list
  // the moment any profile is edited.
  const fetchRef = useRef<() => void>(() => {});
  useProfilePulse(() => fetchRef.current?.(), !!userId);
  fetchRef.current = () => {
    if (userId) void fetchConnections();
  };

  const fetchConnections = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("user_connections")
        .select("*")
        .or(`user_id.eq.${userId},friend_id.eq.${userId}`);

      if (error) throw error;

      // Get all friend IDs to fetch their profiles
      const friendIds =
        data?.map((c) => (c.user_id === userId ? c.friend_id : c.user_id)) ||
        [];

      // Fetch profiles for all friends using profiles_secure view for privacy enforcement
      let profilesMap: Record<string, Profile> = {};
      if (friendIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles_secure")
          .select("id, display_name, avatar_url")
          .in("id", friendIds);

        profilesMap = (profiles || []).reduce(
          (acc, p) => {
            if (!p.id) return acc;
            acc[p.id] = p as Profile;
            return acc;
          },
          {} as Record<string, Profile>,
        );
      }

      // Attach profiles to connections
      const connectionsWithProfiles = (data || []).map((c) => {
        const friendId = c.user_id === userId ? c.friend_id : c.user_id;
        return {
          ...c,
          profile: profilesMap[friendId],
        };
      }) as Connection[];

      const accepted = connectionsWithProfiles.filter(
        (c) => c.status === "accepted",
      );
      const pending = connectionsWithProfiles.filter(
        (c) => c.status === "pending" && c.friend_id === userId,
      );

      setConnections(accepted);
      setPendingRequests(pending);
    } catch (error) {
      console.error("Error fetching connections:", error);
    } finally {
      setLoading(false);
    }
  };

  const sendRequest = async (friendId: string) => {
    if (!userId) return { success: false, error: "User not authenticated" };

    try {
      const { data, error } = await withRlsRetry(() =>
        supabase
          .from("user_connections")
          .insert({
            user_id: userId,
            friend_id: friendId,
            status: "pending",
          })
          .select()
          .single(),
      );

      if (error) {
        // The INSERT policy also enforces a 10-per-hour rate limit, so an RLS
        // rejection here is either an expired session or too many requests.
        if (isRlsViolation(error)) {
          return {
            success: false,
            error: new Error(
              "Couldn't send that request — you may have hit the hourly limit or your session expired. Try again in a bit.",
            ),
          };
        }
        throw error;
      }




      // Send email notification (fire and forget - don't block on this).
      // Display names are resolved server-side.
      supabase.functions
        .invoke("notify-social-email", {
          body: {
            type: "friend_request",
            recipientUserId: friendId,
            connectionId: data.id,
          },
        })
        .catch((emailError) => {
          console.error("Failed to send friend request email:", emailError);
        });

      return { success: true, data };
    } catch (error) {
      console.error("Error sending friend request:", error);
      return { success: false, error };
    }
  };

  const acceptRequest = async (connectionId: string) => {
    try {
      const { data, error } = await supabase
        .from("user_connections")
        .update({ status: "accepted" })
        .eq("id", connectionId)
        .select()
        .single();

      if (error) throw error;

      // The user_id in the connection is the original sender
      const originalSenderId = data.user_id;

      // Send email notification to the original sender (fire and forget)
      supabase.functions
        .invoke("notify-social-email", {
          body: {
            type: "friend_accepted",
            recipientUserId: originalSenderId,
            connectionId: `accepted-${connectionId}`,
          },
        })
        .catch((emailError) => {
          console.error("Failed to send friend accepted email:", emailError);
        });

      setPendingRequests((prev) => prev.filter((c) => c.id !== connectionId));
      setConnections((prev) => [...prev, data as Connection]);
      return { success: true, data };
    } catch (error) {
      console.error("Error accepting request:", error);
      return { success: false, error };
    }
  };

  const removeConnection = async (connectionId: string) => {
    try {
      const { error } = await supabase
        .from("user_connections")
        .delete()
        .eq("id", connectionId);

      if (error) throw error;

      setConnections((prev) => prev.filter((c) => c.id !== connectionId));
      setPendingRequests((prev) => prev.filter((c) => c.id !== connectionId));
      return { success: true };
    } catch (error) {
      console.error("Error removing connection:", error);
      return { success: false, error };
    }
  };

  return {
    connections,
    pendingRequests,
    loading,
    refresh: fetchConnections,
    sendRequest,
    acceptRequest,
    removeConnection,
  };
};
