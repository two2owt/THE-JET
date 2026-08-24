import { useEffect, useState, useCallback, useId } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Deal = Database["public"]["Tables"]["deals"]["Row"];

export interface DealSyncOptions {
  /** Only sync active, non-expired deals. Default true. */
  activeOnly?: boolean;
  /** Fetch immediately on mount. Default true. */
  fetchOnMount?: boolean;
  /** Enable Supabase realtime subscription. Default true. */
  realtime?: boolean;
}

function isActiveDeal(deal: Deal): boolean {
  if (!deal.active) return false;
  const now = new Date().toISOString();
  return deal.starts_at <= now && deal.expires_at >= now;
}

/**
 * Realtime deal sync hook.
 *
 * Handles all four lifecycle events from the `deals` table:
 * - CREATE (INSERT): adds the new deal to the local list
 * - UPDATE: patches the existing deal, or removes it if it became inactive
 * - DEACTIVATE: an UPDATE that flips active=false, treated as a removal
 * - DELETE: removes the deal from the local list
 *
 * Designed to be mounted once per page that renders live deal data.
 */
export function useDealSyncRealtime(options: DealSyncOptions = {}) {
  const { activeOnly = true, fetchOnMount = true, realtime = true } = options;

  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(fetchOnMount);
  const [error, setError] = useState<Error | null>(null);
  const channelId = useId().replace(/[^a-zA-Z0-9]/g, "");

  const fetchDeals = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      let query = supabase
        .from("deals")
        .select("*")
        .order("created_at", { ascending: false });

      if (activeOnly) {
        const now = new Date().toISOString();
        query = query
          .eq("active", true)
          .gte("expires_at", now)
          .lte("starts_at", now);
      }

      const { data, error: fetchError } = await query;
      if (fetchError) throw fetchError;

      setDeals(data || []);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [activeOnly]);

  useEffect(() => {
    if (fetchOnMount) {
      void fetchDeals();
    }
  }, [fetchOnMount, fetchDeals]);

  useEffect(() => {
    if (!realtime) return undefined;

    const channel = supabase
      .channel(`deal-sync-${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "deals",
        },
        (payload) => {
          const event = payload.eventType;

          if (event === "INSERT") {
            const newDeal = payload.new as Deal;
            if (!activeOnly || isActiveDeal(newDeal)) {
              setDeals((prev) => [
                newDeal,
                ...prev.filter((d) => d.id !== newDeal.id),
              ]);
            }
            return;
          }

          if (event === "UPDATE") {
            const updated = payload.new as Deal;
            setDeals((prev) => {
              // If the updated deal is no longer active, remove it.
              if (activeOnly && !isActiveDeal(updated)) {
                return prev.filter((d) => d.id !== updated.id);
              }
              // Otherwise patch it in place.
              return prev.map((d) => (d.id === updated.id ? updated : d));
            });
            return;
          }

          if (event === "DELETE") {
            const deleted = payload.old as Deal;
            setDeals((prev) => prev.filter((d) => d.id !== deleted.id));
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [realtime, activeOnly, channelId]);

  return {
    deals,
    loading,
    error,
    refresh: fetchDeals,
  };
}
