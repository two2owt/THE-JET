import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

type TierKey = "free" | "jet_plus" | "jetx";

// Kept in sync with SUBSCRIPTION_TIERS in src/hooks/useSubscription.ts.
// Duplicated intentionally so the MCP bundle stays free of React/browser imports.
const TIERS: Record<TierKey, { name: string; price: number; benefits: string[] }> = {
  free: {
    name: "JET",
    price: 0,
    benefits: [
      "Deal discovery",
      "Favorites & bookmarks",
      "Search history",
      "Location-based alerts",
    ],
  },
  jet_plus: {
    name: "JET+",
    price: 6.99,
    benefits: [
      "Everything in JET",
      "Friend connections",
      "Social deal sharing",
      "Venue reviews",
      "Priority support",
    ],
  },
  jetx: {
    name: "JETx",
    price: 12.99,
    benefits: [
      "Everything in JET+",
      "VIP exclusive deals",
      "Concierge service",
      "Priority venue access",
      "Early access to features",
    ],
  },
};

const ORDER: TierKey[] = ["free", "jet_plus", "jetx"];

const normalizeTier = (raw: string | null | undefined, subscribed: boolean | null | undefined): TierKey => {
  if (!subscribed) return "free";
  const value = (raw ?? "").toLowerCase().replace(/[\s-]/g, "_");
  if (value === "jetx" || value === "jet_x") return "jetx";
  if (value === "jet_plus" || value === "jetplus" || value === "plus") return "jet_plus";
  return "free";
};

export default defineTool({
  name: "get_tier_benefits",
  title: "Get my tier benefits and promotions",
  description:
    "Return the benefits included with the signed-in user's current JetCard tier, plus the promotions/deals currently available to that tier and what upgrading would unlock.",
  inputSchema: {
    promotions_limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .default(10)
      .describe("Maximum number of currently available promotions to return."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ promotions_limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const userId = ctx.getUserId();
    const nowIso = new Date().toISOString();

    const [subRes, dealsRes] = await Promise.all([
      supabase
        .from("subscribers")
        .select("tier, subscribed, subscription_end, cancel_at_period_end, updated_at")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("deals")
        .select("id, title, description, deal_type, venue_id, venue_name, venue_address, starts_at, expires_at")
        .eq("active", true)
        .lte("starts_at", nowIso)
        .gt("expires_at", nowIso)
        .order("expires_at", { ascending: true })
        .limit(promotions_limit),
    ]);

    const firstError = subRes.error ?? dealsRes.error;
    if (firstError) {
      return { content: [{ type: "text", text: firstError.message }], isError: true };
    }

    const sub = subRes.data;
    const tierKey = normalizeTier(sub?.tier, sub?.subscribed);
    const tier = TIERS[tierKey];
    const currentIndex = ORDER.indexOf(tierKey);

    const upgrades = ORDER.slice(currentIndex + 1).map((key) => ({
      tier: key,
      name: TIERS[key].name,
      monthly_price_usd: TIERS[key].price,
      unlocks: TIERS[key].benefits.filter((b) => !b.startsWith("Everything in")),
    }));

    const promotions = (dealsRes.data ?? []).map((d) => ({
      id: d.id,
      title: d.title,
      description: d.description,
      deal_type: d.deal_type,
      venue_id: d.venue_id,
      venue_name: d.venue_name,
      venue_address: d.venue_address,
      starts_at: d.starts_at,
      expires_at: d.expires_at,
    }));

    const result = {
      membership: {
        tier: tierKey,
        tier_name: tier.name,
        monthly_price_usd: tier.price,
        subscribed: sub?.subscribed ?? false,
        renews_or_ends: sub?.subscription_end ?? null,
        cancel_at_period_end: sub?.cancel_at_period_end ?? false,
        last_synced: sub?.updated_at ?? null,
      },
      benefits: tier.benefits,
      promotions_available_now: promotions,
      promotion_count: promotions.length,
      upgrade_options: upgrades,
    };

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result,
    };
  },
});