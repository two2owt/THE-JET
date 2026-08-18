import { useCallback, useMemo } from "react";
import { useNotifications, type Notification } from "@/hooks/useNotifications";
import type { Favorite } from "@/hooks/useFavorites";

export interface FavoriteAlertGroup {
  /** venue id when the alert maps to a saved venue */
  venueId?: string;
  /** deal id when the alert maps to a saved deal */
  dealId?: string;
  unread: Notification[];
}

const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();

/**
 * Correlates the alerts inbox with the user's favorites so /favorites can show
 * a per-venue (and per-deal) unread indicator that opens the right JetCard.
 *
 * Matching order: explicit venue_id on the push payload, then deal_id from the
 * legacy notification log, then a venue-name match on the alert title/message
 * for merchant alerts that predate venue ids.
 */
export function useFavoriteAlerts(
  favorites: Favorite[],
  enabled: boolean = true,
) {
  const { notifications, markAsRead, loading } = useNotifications(enabled);

  const unread = useMemo(
    () => notifications.filter((n) => !n.read),
    [notifications],
  );

  const byVenue = useMemo(() => {
    const map = new Map<string, Notification[]>();
    if (unread.length === 0) return map;

    const nameToVenue = new Map<string, string>();
    for (const f of favorites) {
      if (f.venue_id && f.venue_name) nameToVenue.set(norm(f.venue_name), f.venue_id);
    }
    const venueIds = new Set(
      favorites.map((f) => f.venue_id).filter((v): v is string => !!v),
    );

    const push = (venueId: string, n: Notification) => {
      const list = map.get(venueId);
      if (list) list.push(n);
      else map.set(venueId, [n]);
    };

    for (const n of unread) {
      if (n.venue && venueIds.has(n.venue)) {
        push(n.venue, n);
        continue;
      }
      const haystack = `${n.title} ${n.message}`.toLowerCase();
      for (const [name, venueId] of nameToVenue) {
        if (name.length >= 3 && haystack.includes(name)) {
          push(venueId, n);
          break;
        }
      }
    }
    return map;
  }, [unread, favorites]);

  const byDeal = useMemo(() => {
    const map = new Map<string, Notification[]>();
    for (const n of unread) {
      if (!n.dealId) continue;
      const list = map.get(n.dealId);
      if (list) list.push(n);
      else map.set(n.dealId, [n]);
    }
    return map;
  }, [unread]);

  const totalUnread = useMemo(() => {
    const ids = new Set<string>();
    for (const list of byVenue.values()) list.forEach((n) => ids.add(n.id));
    for (const list of byDeal.values()) list.forEach((n) => ids.add(n.id));
    return ids.size;
  }, [byVenue, byDeal]);

  /** Marks every alert tied to one favorite as read (optimistic + durable). */
  const markFavoriteAlertsRead = useCallback(
    async (opts: { venueId?: string | null; dealId?: string | null }) => {
      const targets = [
        ...(opts.venueId ? (byVenue.get(opts.venueId) ?? []) : []),
        ...(opts.dealId ? (byDeal.get(opts.dealId) ?? []) : []),
      ];
      const seen = new Set<string>();
      for (const n of targets) {
        if (seen.has(n.id)) continue;
        seen.add(n.id);
        await markAsRead(n.id);
      }
    },
    [byVenue, byDeal, markAsRead],
  );

  return { byVenue, byDeal, totalUnread, markFavoriteAlertsRead, loading };
}