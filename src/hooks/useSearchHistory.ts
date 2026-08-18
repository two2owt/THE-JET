import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface SearchHistoryItem {
  id: string;
  user_id: string;
  search_query: string;
  created_at: string;
}

export const useSearchHistory = (userId: string | undefined) => {
  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (userId) {
      fetchSearchHistory();
    } else {
      setSearchHistory([]);
      setLoading(false);
    }
  }, [userId]);

  const fetchSearchHistory = async () => {
    if (!userId) return;

    try {
      const { data, error } = await supabase
        .from("search_history")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) throw error;
      setSearchHistory(data || []);
    } catch (error) {
      console.error("Error fetching search history:", error);
    } finally {
      setLoading(false);
    }
  };

  const addToSearchHistory = async (query: string) => {
    if (!userId || !query.trim()) return;

    try {
      // Check if query already exists recently
      const recentQuery = searchHistory.find(
        (item) => item.search_query.toLowerCase() === query.toLowerCase(),
      );

      if (!recentQuery) {
        const { error } = await supabase
          .from("search_history")
          .insert({ user_id: userId, search_query: query.trim() });

        if (error) throw error;
        await fetchSearchHistory();
      }
    } catch (error) {
      console.error("Error adding to search history:", error);
    }
  };

  const clearSearchHistory = async () => {
    if (!userId) return;

    try {
      const { error } = await supabase
        .from("search_history")
        .delete()
        .eq("user_id", userId);

      if (error) throw error;
      setSearchHistory([]);
    } catch (error) {
      console.error("Error clearing search history:", error);
    }
  };

  return {
    searchHistory,
    loading,
    addToSearchHistory,
    clearSearchHistory,
    refetch: fetchSearchHistory,
  };
};
