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
  // Snapshot of venue metadata captured at favorite time so venue-only
  // favorites can render on /favorites without an active deal.
  venue_name?: string | null;
  venue_address?: string | null;
  venue_image_url?: string | null;
  venue_category?: string | null;
  venue_neighborhood?: string | null;
  venue_lat?: number | null;
  venue_lng?: number | null;
}

export interface VenueFavoriteSnapshot {
  name?: string | null;
  address?: string | null;
  imageUrl?: string | null;
  category?: string | null;
  neighborhood?: string | null;
  lat?: number | null;
  lng?: number | null;
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
    const previous = favorites;

    try {
      if (favorite) {
        // Optimistically remove
        setFavorites((curr) => curr.filter((fav) => fav.id !== favorite.id));
        const { error } = await supabase
          .from("user_favorites")
          .delete()
          .eq("id", favorite.id);

        if (error) throw error;

        toast("Removed from favorites", {
          description: "Deal removed from your favorites",
        });
      } else {
        // Optimistically add with a temp row
        const tempId = `temp-${Date.now()}`;
        const optimistic: Favorite = {
          id: tempId,
          user_id: userId,
          deal_id: dealId,
          venue_id: null,
          created_at: new Date().toISOString(),
        };
        setFavorites((curr) => [optimistic, ...curr]);
        const { data, error } = await supabase
          .from("user_favorites")
          .insert({ user_id: userId, deal_id: dealId })
          .select()
          .single();

        if (error) throw error;

        setFavorites((curr) => [data, ...curr.filter((f) => f.id !== tempId)]);
        toast.success("Added to favorites", {
          description: "Deal saved to your favorites",
        });
      }
    } catch (error) {
      console.error("Error toggling favorite:", error);
      // Roll back to pre-toggle state
      setFavorites(previous);
      toast.error("Error", { description: "Failed to update favorites" });
    }
  };

  /**
   * Toggle a favorite for a map venue (no active deal required). When
   * `dealId` is also provided we store it alongside venue_id so the favorite
   * still shows on /favorites alongside deal-linked entries.
   */
  const toggleVenueFavorite = async (
    venueId: string,
    dealId?: string | null,
    snapshot?: VenueFavoriteSnapshot,
  ) => {
    if (!userId) {
      toast.error("Sign in required", {
        description: "Please sign in to save favorites",
      });
      return;
    }

    const existing = favorites.find(
      (fav) => fav.venue_id === venueId || (dealId && fav.deal_id === dealId)
    );
    const previous = favorites;

    try {
      if (existing) {
        // Optimistically remove
        setFavorites((curr) => curr.filter((fav) => fav.id !== existing.id));
        const { error } = await supabase
          .from("user_favorites")
          .delete()
          .eq("id", existing.id);
        if (error) throw error;
        toast("Removed from favorites", { description: "Venue removed from your favorites" });
      } else {
        const payload: { user_id: string; venue_id: string; deal_id?: string } = {
          user_id: userId,
          venue_id: venueId,
        };
        if (dealId) payload.deal_id = dealId;
        const snap: Record<string, unknown> = {};
        if (snapshot?.name) snap.venue_name = snapshot.name;
        if (snapshot?.address) snap.venue_address = snapshot.address;
        if (snapshot?.imageUrl) snap.venue_image_url = snapshot.imageUrl;
        if (snapshot?.category) snap.venue_category = snapshot.category;
        if (snapshot?.neighborhood) snap.venue_neighborhood = snapshot.neighborhood;
        if (typeof snapshot?.lat === "number") snap.venue_lat = snapshot.lat;
        if (typeof snapshot?.lng === "number") snap.venue_lng = snapshot.lng;
        // Optimistically add with a temp row
        const tempId = `temp-${Date.now()}`;
        const optimistic: Favorite = {
          id: tempId,
          user_id: userId,
          deal_id: dealId ?? null,
          venue_id: venueId,
          created_at: new Date().toISOString(),
          venue_name: snapshot?.name ?? null,
          venue_address: snapshot?.address ?? null,
          venue_image_url: snapshot?.imageUrl ?? null,
          venue_category: snapshot?.category ?? null,
          venue_neighborhood: snapshot?.neighborhood ?? null,
          venue_lat: snapshot?.lat ?? null,
          venue_lng: snapshot?.lng ?? null,
        };
        setFavorites((curr) => [optimistic, ...curr]);
        const { data, error } = await supabase
          .from("user_favorites")
          .insert({ ...payload, ...snap })
          .select()
          .single();
        if (error) throw error;
        setFavorites((curr) => [data, ...curr.filter((f) => f.id !== tempId)]);
        toast.success("Added to favorites", { description: "Venue saved to your favorites" });
      }
    } catch (error) {
      console.error("Error toggling venue favorite:", error);
      // Roll back to pre-toggle state
      setFavorites(previous);
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
