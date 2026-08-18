import { defineTool } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_jetcard",
  title: "Get my JetCard",
  description:
    "Return the signed-in user's JetCard summary: membership status and tier, the associated merchant/venue, and the most recent account activity.",
  inputSchema: {},
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return {
        content: [{ type: "text", text: "Not authenticated" }],
        isError: true,
      };
    }
    const supabase = supabaseForUser(ctx);
    const userId = ctx.getUserId();

    const [subRes, favRes, eventRes] = await Promise.all([
      supabase
        .from("subscribers")
        .select(
          "tier, subscribed, subscription_end, cancel_at_period_end, product_id, updated_at",
        )
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("user_favorites")
        .select(
          "venue_id, venue_name, venue_address, venue_category, venue_neighborhood, deal_id, created_at",
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("analytics_events")
        .select("event_name, page_path, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const firstError = subRes.error ?? favRes.error ?? eventRes.error;
    if (firstError) {
      return {
        content: [{ type: "text", text: firstError.message }],
        isError: true,
      };
    }

    const sub = subRes.data;
    const fav = favRes.data;

    let merchant: Record<string, unknown> | null = null;
    if (fav?.deal_id) {
      const { data: deal } = await supabase
        .from("deals")
        .select(
          "id, merchant_id, venue_id, venue_name, venue_address, title, active, expires_at",
        )
        .eq("id", fav.deal_id)
        .maybeSingle();
      if (deal) {
        merchant = {
          merchant_id: deal.merchant_id,
          venue_id: deal.venue_id,
          venue_name: deal.venue_name,
          venue_address: deal.venue_address,
          latest_deal: {
            id: deal.id,
            title: deal.title,
            active: deal.active,
            expires_at: deal.expires_at,
          },
        };
      }
    }
    if (!merchant && fav) {
      merchant = {
        merchant_id: null,
        venue_id: fav.venue_id,
        venue_name: fav.venue_name,
        venue_address: fav.venue_address,
        latest_deal: null,
      };
    }

    const lastActivityCandidates = [
      eventRes.data
        ? {
            type: eventRes.data.event_name,
            at: eventRes.data.created_at,
            page_path: eventRes.data.page_path,
          }
        : null,
      fav
        ? { type: "favorite_saved", at: fav.created_at, page_path: null }
        : null,
    ].filter(Boolean) as Array<{
      type: string;
      at: string;
      page_path: string | null;
    }>;

    lastActivityCandidates.sort(
      (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
    );

    const jetcard = {
      user_id: userId,
      email: ctx.getUserEmail(),
      status: sub?.subscribed ? "active" : "free",
      tier: sub?.tier ?? "JET",
      renews_or_ends_at: sub?.subscription_end ?? null,
      cancel_at_period_end: sub?.cancel_at_period_end ?? false,
      merchant,
      last_activity: lastActivityCandidates[0] ?? null,
    };

    return {
      content: [{ type: "text", text: JSON.stringify(jetcard, null, 2) }],
      structuredContent: { jetcard },
    };
  },
});
