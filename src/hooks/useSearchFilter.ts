import { useEffect, useMemo, useState } from "react";
import type { Venue } from "@/types/venue";
import type { Database } from "@/integrations/supabase/types";

type Deal = Database["public"]["Tables"]["deals"]["Row"];

const RESULT_CAP = 25;
const DEBOUNCE_MS = 120;

/** Lowercase once, multi-token AND match. Empty query => all. */
function tokenize(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

function matchesAll(haystack: string, tokens: string[]): boolean {
  for (const t of tokens) {
    if (!haystack.includes(t)) return false;
  }
  return true;
}

export interface UseSearchFilterResult {
  venues: Venue[];
  deals: Deal[];
  totalCount: number;
  truncated: boolean;
  debouncedQuery: string;
}

/**
 * Debounced, memoized search filter over venues + deals.
 *
 * - Lowercases haystacks once per row per (venues|deals) reference.
 * - Multi-token AND matching (case-insensitive).
 * - Caps each list at RESULT_CAP to keep the DOM small.
 */
export function useSearchFilter(
  query: string,
  venues: Venue[],
  deals: Deal[],
): UseSearchFilterResult {
  const [debouncedQuery, setDebouncedQuery] = useState(query);

  useEffect(() => {
    if (query === debouncedQuery) return;
    const id = window.setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // Pre-compute lowercase haystacks per row, cached by list identity.
  const venueHaystacks = useMemo(
    () =>
      venues.map(
        (v) =>
          `${v.name} ${v.category} ${v.neighborhood}`.toLowerCase(),
      ),
    [venues],
  );

  const dealHaystacks = useMemo(
    () =>
      deals.map((d) =>
        `${d.title} ${d.description} ${d.venue_name} ${d.deal_type}`.toLowerCase(),
      ),
    [deals],
  );

  return useMemo(() => {
    const tokens = tokenize(debouncedQuery);
    if (tokens.length === 0) {
      return {
        venues: [],
        deals: [],
        totalCount: 0,
        truncated: false,
        debouncedQuery,
      };
    }

    const venueHits: Venue[] = [];
    let venueTruncated = false;
    for (let i = 0; i < venues.length; i++) {
      if (!matchesAll(venueHaystacks[i], tokens)) continue;
      if (venueHits.length >= RESULT_CAP) {
        venueTruncated = true;
        break;
      }
      venueHits.push(venues[i]);
    }

    const dealHits: Deal[] = [];
    let dealTruncated = false;
    for (let i = 0; i < deals.length; i++) {
      if (!matchesAll(dealHaystacks[i], tokens)) continue;
      if (dealHits.length >= RESULT_CAP) {
        dealTruncated = true;
        break;
      }
      dealHits.push(deals[i]);
    }

    return {
      venues: venueHits,
      deals: dealHits,
      totalCount: venueHits.length + dealHits.length,
      truncated: venueTruncated || dealTruncated,
      debouncedQuery,
    };
  }, [debouncedQuery, venues, deals, venueHaystacks, dealHaystacks]);
}

export const SEARCH_RESULT_CAP = RESULT_CAP;