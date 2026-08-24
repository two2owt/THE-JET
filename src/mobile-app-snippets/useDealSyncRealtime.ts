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
/**
 * Module-level warm cache. Tab switches unmount this hook, and without a
 * cache every remount fell back to an empty list + full skeleton while the
 * network round-trip ran, which reads as lag. We now hydrate synchronously
 * from the last known result and revalidate in the background.
 */
const dealCache = new Map<string, DealWithNeighborhood[]>();
/** When each cache key was last filled from the network. */
const dealCacheAt = new Map<string, number>();
/** In-flight fetch per cache key, so concurrent mounts share one request. */
const inFlight = new Map<string, Promise<DealWithNeighborhood[]>>();
/**
 * How long a cached list is treated as fresh. Realtime keeps the list correct
 * between mounts, so a remount inside this window needs no network round-trip
 * at all — that is the difference between an instant tab switch and a spinner.
 */
const DEAL_CACHE_TTL_MS = 60_000;

export function useDealSyncRealtime(options: DealSyncOptions = {}) {
  const { activeOnly = true, fetchOnMount = true, realtime = true } = options;

  const cacheKey = activeOnly ? "active" : "all";
  const cached = dealCache.get(cacheKey);

  const [deals, setDealsState] = useState<DealWithNeighborhood[]>(
    cached ?? [],
  );
  const setDeals = useCallback<typeof setDealsState>((update) => {
    setDealsState((prev) => {
      const next =
        typeof update === "function"
          ? (update as (p: DealWithNeighborhood[]) => DealWithNeighborhood[])(
              prev,
            )
          : update;
      dealCache.set(cacheKey, next);
      return next;
    });
  }, [cacheKey]);
  const [loading, setLoading] = useState(fetchOnMount && !cached);
  const [error, setError] = useState<Error | null>(null);
  const channelId = useId().replace(/[^a-zA-Z0-9]/g, "");

  // Track in-flight single-deal fetches so bursts of realtime events don't
  // fire redundant requests.
  const pendingFetchRef = useRef<Set<string>>(new Set());

  const fetchDeals = useCallback(
    async (opts: { force?: boolean } = {}) => {
      const cachedList = dealCache.get(cacheKey);
      const cachedAt = dealCacheAt.get(cacheKey) ?? 0;
      const fresh = Date.now() - cachedAt < DEAL_CACHE_TTL_MS;

      // Fresh cache + realtime patches already in place: nothing to do.
      if (!opts.force && cachedList && fresh) {
        setLoading(false);
        return;
      }

      try {
        // Only surface the skeleton when there is nothing cached to show;
        // otherwise revalidate silently behind the existing list.
        if (!cachedList?.length) setLoading(true);
        setError(null);
        // Coalesce parallel mounts (page + header) onto a single request.
        let promise = inFlight.get(cacheKey);
        if (!promise) {
          promise = fetchDealsWithNeighborhoods(activeOnly);
          inFlight.set(cacheKey, promise);
          promise.finally(() => inFlight.delete(cacheKey));
        }
        const data = await promise;
        dealCacheAt.set(cacheKey, Date.now());
        setDeals(data);
      } catch (err) {
        if (!dealCache.get(cacheKey)?.length) setError(err as Error);
      } finally {
        setLoading(false);
      }
    },
    [activeOnly, cacheKey, setDeals],
  );

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

    return subscribeToDealChanges((payload) => {
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
    });
  }, [realtime, activeOnly, applySingleDealUpdate, setDeals]);


  return {
    deals,
    loading,
    error,
    /** Pull-to-refresh and manual refresh bypass the freshness window. */
    refresh: () => fetchDeals({ force: true }),
  };
}
