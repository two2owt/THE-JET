import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface Favorite {
  id: string;
  user_id: string;
  // Either deal_id (linked to an active deal) or venue_id (map venue without
  // an active deal) will be set; one is always required.
  deal_id: string | null;
  venue_id: string | null;
  created_at: string;
}

export const useFavorites = (userId: string | undefined) => {
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFavorites = useCallback(async () => {
    if (!userId) {
      setFavorites([]);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("user_favorites")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setFavorites(data || []);
    } catch (error) {
      console.error("Error fetching favorites:", error);
      toast.error("Error", { description: "Failed to load favorites" });
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchFavorites();

    // Set up real-time subscription for favorites changes
    if (!userId) return;

    const channel = supabase
      .channel(`favorites-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_favorites',
          filter: `user_id=eq.${userId}`
        },
        () => {
          // Refetch on any change to ensure consistency across devices
          fetchFavorites();
        }
      )
      .subscribe();

    // Listen for visibility changes to refresh on tab focus
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetchFavorites();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [userId, fetchFavorites]);

  const isFavorite = (dealId: string) => {
    return favorites.some((fav) => fav.deal_id === dealId);
  };

  /** True when the user already favorited this venue by venue id. */
  const isVenueFavorite = (venueId: string) => {
    return favorites.some((fav) => fav.venue_id === venueId);
  };

  const toggleFavorite = async (dealId: string) => {
    if (!userId) {
      toast.error("Sign in required", {
        description: "Please sign in to save favorites",
      });
      return;
    }

    const favorite = favorites.find((fav) => fav.deal_id === dealId);

    try {
      if (favorite) {
        // Remove favorite
        const { error } = await supabase
          .from("user_favorites")
          .delete()
          .eq("id", favorite.id);

        if (error) throw error;

        setFavorites(favorites.filter((fav) => fav.id !== favorite.id));
        toast("Removed from favorites", {
          description: "Deal removed from your favorites",
        });
      } else {
        // Add favorite
        const { data, error } = await supabase
          .from("user_favorites")
          .insert({ user_id: userId, deal_id: dealId })
          .select()
          .single();

        if (error) throw error;

        setFavorites([data, ...favorites]);
        toast.success("Added to favorites", {
          description: "Deal saved to your favorites",
        });
      }
    } catch (error) {
      console.error("Error toggling favorite:", error);
      toast.error("Error", { description: "Failed to update favorites" });
    }
  };

  /**
   * Toggle a favorite for a map venue (no active deal required). When
   * `dealId` is also provided we store it alongside venue_id so the favorite
   * still shows on /favorites alongside deal-linked entries.
   */
  const toggleVenueFavorite = async (venueId: string, dealId?: string | null) => {
    if (!userId) {
      toast.error("Sign in required", {
        description: "Please sign in to save favorites",
      });
      return;
    }

    const existing = favorites.find(
      (fav) => fav.venue_id === venueId || (dealId && fav.deal_id === dealId)
    );

    try {
      if (existing) {
        const { error } = await supabase
          .from("user_favorites")
          .delete()
          .eq("id", existing.id);
        if (error) throw error;
        setFavorites(favorites.filter((fav) => fav.id !== existing.id));
        toast("Removed from favorites", { description: "Venue removed from your favorites" });
      } else {
        const payload: { user_id: string; venue_id: string; deal_id?: string } = {
          user_id: userId,
          venue_id: venueId,
        };
        if (dealId) payload.deal_id = dealId;
        const { data, error } = await supabase
          .from("user_favorites")
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        setFavorites([data, ...favorites]);
        toast.success("Added to favorites", { description: "Venue saved to your favorites" });
      }
    } catch (error) {
      console.error("Error toggling venue favorite:", error);
      toast.error("Error", { description: "Failed to update favorites" });
    }
  };

  return {
    favorites,
    loading,
    isFavorite,
    isVenueFavorite,
    toggleFavorite,
    toggleVenueFavorite,
    refetch: fetchFavorites,
  };
};
