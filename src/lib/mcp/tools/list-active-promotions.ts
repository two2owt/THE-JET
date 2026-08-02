import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const TIER_LABEL: Record<string, string> = {
  free: "JET",
  jet_plus: "JET+",
  jetx: "JETx",
};

const normalizeTier = (raw: string | null | undefined, subscribed: boolean | null | undefined): string => {
  if (!subscribed) return "free";
  const value = (raw ?? "").toLowerCase().replace(/[\s-]/g, "_");
  if (value === "jetx" || value === "jet_x") return "jetx";
  if (value === "jet_plus" || value === "jetplus" || value === "plus") return "jet_plus";
  return "free";
};

const humanDuration = (ms: number): string => {
  if (ms <= 0) return "expired";
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

export default defineTool({
  name: "list_active_promotions",
  title: "List my active promotions",
  description:
    "List the promotions/deals that are currently active and available to the signed-in user, including each promotion's expiration date, time remaining, and the eligibility conditions (active days of week, start/end window, membership tier, venue, and whether the user has saved it).",
  inputSchema: {
    only_favorites: z
      .boolean()
      .default(false)
      .describe("When true, only return promotions for venues or deals the user has saved as favorites."),
    venue_id: z
      .string()
      .trim()
      .optional()
      .describe("Optional venue id to restrict promotions to a single venue."),
    expiring_within_hours: z
      .number()
      .int()
      .min(1)
      .max(720)
      .optional()
      .describe("Optional filter: only promotions expiring within this many hours."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .default(20)
      .describe("Maximum number of promotions to return."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ only_favorites, venue_id, expiring_within_hours, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const userId = ctx.getUserId();
    const now = new Date();
    const nowIso = now.toISOString();
    const todayIndex = now.getDay();

    let dealsQuery = supabase
      .from("deals")
      .select(
        "id, title, description, deal_type, venue_id, venue_name, venue_address, starts_at, expires_at, active_days, website_url, image_url",
      )
      .eq("active", true)
      .lte("starts_at", nowIso)
      .gt("expires_at", nowIso)
      .order("expires_at", { ascending: true })
      .limit(limit);

    if (venue_id) dealsQuery = dealsQuery.eq("venue_id", venue_id);
    if (expiring_within_hours) {
      const cutoff = new Date(now.getTime() + expiring_within_hours * 3600_000).toISOString();
      dealsQuery = dealsQuery.lte("expires_at", cutoff);
    }

    const [dealsRes, favRes, subRes] = await Promise.all([
      dealsQuery,
      supabase.from("user_favorites").select("deal_id, venue_id").eq("user_id", userId),
      supabase
        .from("subscribers")
        .select("tier, subscribed, subscription_end")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

    const firstError = dealsRes.error ?? favRes.error ?? subRes.error;
    if (firstError) {
      return { content: [{ type: "text", text: firstError.message }], isError: true };
    }

    const favoriteDealIds = new Set((favRes.data ?? []).map((f) => f.deal_id).filter(Boolean) as string[]);
    const favoriteVenueIds = new Set((favRes.data ?? []).map((f) => f.venue_id).filter(Boolean) as string[]);

    const tierKey = normalizeTier(subRes.data?.tier, subRes.data?.subscribed);

    let promotions = (dealsRes.data ?? []).map((d) => {
      const expiresAt = new Date(d.expires_at);
      const activeDays: number[] | null = Array.isArray(d.active_days) && d.active_days.length > 0 ? d.active_days : null;
      const runsToday = !activeDays || activeDays.includes(todayIndex);
      const isFavorite = favoriteDealIds.has(d.id) || (!!d.venue_id && favoriteVenueIds.has(d.venue_id));

      return {
        id: d.id,
        title: d.title,
        description: d.description,
        deal_type: d.deal_type,
        venue: {
          id: d.venue_id,
          name: d.venue_name,
          address: d.venue_address,
        },
        website_url: d.website_url,
        image_url: d.image_url,
        starts_at: d.starts_at,
        expires_at: d.expires_at,
        expires_in: humanDuration(expiresAt.getTime() - now.getTime()),
        ending_soon: expiresAt.getTime() - now.getTime() <= 60 * 60_000,
        eligibility: {
          membership_tier_required: "JET (all tiers)",
          your_tier: TIER_LABEL[tierKey] ?? "JET",
          eligible_now: runsToday,
          active_days: activeDays ? activeDays.map((n) => DAY_NAMES[n] ?? String(n)) : "Every day",
          redeemable_window: `${d.starts_at} to ${d.expires_at}`,
          location: "In-person at the venue (Charlotte, NC)",
          saved_by_you: isFavorite,
          notes: runsToday
            ? "Available today during the venue's operating hours."
            : "Not scheduled for today — check the active days above.",
        },
      };
    });

    if (only_favorites) {
      promotions = promotions.filter((p) => p.eligibility.saved_by_you);
    }

    const result = {
      as_of: nowIso,
      your_tier: TIER_LABEL[tierKey] ?? "JET",
      subscription_ends: subRes.data?.subscription_end ?? null,
      promotion_count: promotions.length,
      eligible_today_count: promotions.filter((p) => p.eligibility.eligible_now).length,
      filters: {
        only_favorites,
        venue_id: venue_id ?? null,
        expiring_within_hours: expiring_within_hours ?? null,
      },
      promotions,
    };

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result,
    };
  },
});
