import { useEffect, useState, useCallback, useId, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Deal = Database["public"]["Tables"]["deals"]["Row"];

export type DealWithNeighborhood = Deal & {
  neighborhoods?: {
    id: string;
    name: string;
    center_lat: number;
    center_lng: number;
  } | null;
};

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

async function fetchDealWithNeighborhood(
  id: string,
): Promise<DealWithNeighborhood | null> {
  const { data, error } = await supabase
    .from("deals")
    .select(
      `
      *,
      neighborhoods (
        id,
        name,
        center_lat,
        center_lng
      )
    `,
    )
    .eq("id", id)
    .single();

  if (error) {
    console.error("Error fetching deal with neighborhood:", error);
    return null;
  }

  return (data as DealWithNeighborhood) || null;
}

async function fetchDealsWithNeighborhoods(
  activeOnly: boolean,
): Promise<DealWithNeighborhood[]> {
  let query = supabase
    .from("deals")
    .select(
      `
      *,
      neighborhoods (
        id,
        name,
        center_lat,
        center_lng
      )
    `,
    )
    .order("created_at", { ascending: false });

  if (activeOnly) {
    const now = new Date().toISOString();
    query = query
      .eq("active", true)
      .gte("expires_at", now)
      .lte("starts_at", now);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data as DealWithNeighborhood[]) || [];
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

  const [deals, setDeals] = useState<DealWithNeighborhood[]>([]);
  const [loading, setLoading] = useState(fetchOnMount);
  const [error, setError] = useState<Error | null>(null);
  const channelId = useId().replace(/[^a-zA-Z0-9]/g, "");

  // Track in-flight single-deal fetches so bursts of realtime events don't
  // fire redundant requests.
  const pendingFetchRef = useRef<Set<string>>(new Set());

  const fetchDeals = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchDealsWithNeighborhoods(activeOnly);
      setDeals(data);
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

  const applySingleDealUpdate = useCallback(async (id: string) => {
    if (pendingFetchRef.current.has(id)) return;
    pendingFetchRef.current.add(id);

    try {
      const deal = await fetchDealWithNeighborhood(id);
      setDeals((prev) => {
        if (!deal) return prev;

        // If the deal is no longer active (or doesn't exist), remove it.
        if (activeOnly && !isActiveDeal(deal)) {
          return prev.filter((d) => d.id !== id);
        }

        const exists = prev.some((d) => d.id === id);
        if (exists) {
          return prev.map((d) => (d.id === id ? deal : d));
        }
        return [deal, ...prev];
      });
    } catch (err) {
      console.error("Error applying realtime deal update:", err);
    } finally {
      pendingFetchRef.current.delete(id);
    }
  }, [activeOnly]);

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
            if (activeOnly && !isActiveDeal(newDeal)) return;
            void applySingleDealUpdate(newDeal.id);
            return;
          }

          if (event === "UPDATE") {
            const updated = payload.new as Deal;

            if (activeOnly && !isActiveDeal(updated)) {
              // Treat deactivation the same as a delete.
              setDeals((prev) => prev.filter((d) => d.id !== updated.id));
              return;
            }

            // Fetch the full deal with neighborhoods and patch it in place.
            // If the deal was previously inactive, this also adds it to the list.
            void applySingleDealUpdate(updated.id);
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
  }, [realtime, activeOnly, channelId, applySingleDealUpdate]);

  return {
    deals,
    loading,
    error,
    refresh: fetchDeals,
  };
}
