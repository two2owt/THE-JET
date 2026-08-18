import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

type VenueEntry = {
  venue_id: string | null;
  venue_name: string | null;
  venue_address: string | null;
  category: string | null;
  neighborhood: string | null;
  associations: string[];
  deals: Array<{
    id: string;
    title: string;
    deal_type: string | null;
    active: boolean | null;
    starts_at: string | null;
    expires_at: string | null;
    source: string;
  }>;
  last_interaction_at: string | null;
};

export default defineTool({
  name: "list_my_venues",
  title: "List my venues and deals",
  description:
    "Return every venue and deal associated with the signed-in user's account — saved favorites (venues and deals), reviewed venues, and shared deals — grouped by venue with the reason for each association.",
  inputSchema: {
    include: z
      .enum(["all", "favorites", "reviews", "shares"])
      .default("all")
      .describe("Which associations to include."),
    active_deals_only: z
      .boolean()
      .default(false)
      .describe(
        "Only include deals that are currently active and not expired.",
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .default(50)
      .describe("Maximum venues to return."),
  },
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: async ({ include, active_deals_only, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return {
        content: [{ type: "text", text: "Not authenticated" }],
        isError: true,
      };
    }
    const supabase = supabaseForUser(ctx);
    const userId = ctx.getUserId();
    const want = (kind: string) => include === "all" || include === kind;

    const dealSelect =
      "id, venue_id, venue_name, venue_address, title, deal_type, active, starts_at, expires_at";

    const [favRes, reviewRes, shareRes] = await Promise.all([
      want("favorites")
        ? supabase
            .from("user_favorites")
            .select(
              `created_at, venue_id, venue_name, venue_address, venue_category, venue_neighborhood, deal_id, deals(${dealSelect})`,
            )
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(200)
        : Promise.resolve({ data: [], error: null }),
      want("reviews")
        ? supabase
            .from("venue_reviews")
            .select("created_at, venue_id, venue_name, rating")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(200)
        : Promise.resolve({ data: [], error: null }),
      want("shares")
        ? supabase
            .from("deal_shares")
            .select(`shared_at, deal_id, deals(${dealSelect})`)
            .eq("user_id", userId)
            .order("shared_at", { ascending: false })
            .limit(200)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const firstError = favRes.error ?? reviewRes.error ?? shareRes.error;
    if (firstError) {
      return {
        content: [{ type: "text", text: firstError.message }],
        isError: true,
      };
    }

    const now = Date.now();
    const byVenue = new Map<string, VenueEntry>();

    const entryFor = (
      venueId: string | null,
      venueName: string | null,
    ): VenueEntry => {
      const key = venueId ?? venueName ?? "unknown";
      let entry = byVenue.get(key);
      if (!entry) {
        entry = {
          venue_id: venueId,
          venue_name: venueName,
          venue_address: null,
          category: null,
          neighborhood: null,
          associations: [],
          deals: [],
          last_interaction_at: null,
        };
        byVenue.set(key, entry);
      }
      return entry;
    };

    const touch = (
      entry: VenueEntry,
      association: string,
      at: string | null,
    ) => {
      if (!entry.associations.includes(association))
        entry.associations.push(association);
      if (
        at &&
        (!entry.last_interaction_at || at > entry.last_interaction_at)
      ) {
        entry.last_interaction_at = at;
      }
    };

    type DealRow = {
      id: string;
      venue_id: string | null;
      venue_name: string | null;
      venue_address: string | null;
      title: string;
      deal_type: string | null;
      active: boolean | null;
      starts_at: string | null;
      expires_at: string | null;
    };

    const addDeal = (entry: VenueEntry, deal: DealRow, source: string) => {
      if (active_deals_only) {
        const expired = deal.expires_at
          ? new Date(deal.expires_at).getTime() < now
          : false;
        if (deal.active !== true || expired) return;
      }
      if (entry.deals.some((d) => d.id === deal.id)) return;
      entry.deals.push({
        id: deal.id,
        title: deal.title,
        deal_type: deal.deal_type,
        active: deal.active,
        starts_at: deal.starts_at,
        expires_at: deal.expires_at,
        source,
      });
    };

    for (const row of (favRes.data ?? []) as any[]) {
      const deal = row.deals as DealRow | null;
      const entry = entryFor(
        row.venue_id ?? deal?.venue_id ?? null,
        row.venue_name ?? deal?.venue_name ?? null,
      );
      entry.venue_address ??= row.venue_address ?? deal?.venue_address ?? null;
      entry.category ??= row.venue_category ?? null;
      entry.neighborhood ??= row.venue_neighborhood ?? null;
      touch(entry, deal ? "favorite_deal" : "favorite_venue", row.created_at);
      if (deal) addDeal(entry, deal, "favorite");
    }

    for (const row of (reviewRes.data ?? []) as any[]) {
      const entry = entryFor(row.venue_id ?? null, row.venue_name ?? null);
      touch(entry, "reviewed", row.created_at);
    }

    for (const row of (shareRes.data ?? []) as any[]) {
      const deal = row.deals as DealRow | null;
      if (!deal) continue;
      const entry = entryFor(deal.venue_id ?? null, deal.venue_name ?? null);
      entry.venue_address ??= deal.venue_address ?? null;
      touch(entry, "shared_deal", row.shared_at);
      addDeal(entry, deal, "shared");
    }

    const venues = Array.from(byVenue.values())
      .sort((a, b) =>
        (b.last_interaction_at ?? "").localeCompare(
          a.last_interaction_at ?? "",
        ),
      )
      .slice(0, limit);

    const dealCount = venues.reduce((sum, v) => sum + v.deals.length, 0);

    return {
      content: [
        {
          type: "text",
          text: venues.length
            ? JSON.stringify(venues, null, 2)
            : "No venues or deals are associated with this account yet.",
        },
      ],
      structuredContent: {
        venues,
        venue_count: venues.length,
        deal_count: dealCount,
      },
    };
  },
});
