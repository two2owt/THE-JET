import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

type Activity = {
  timestamp: string;
  action: string;
  venue_id: string | null;
  venue_name: string | null;
  details: string | null;
};

export default defineTool({
  name: "list_activity",
  title: "List my recent JetCard activity",
  description:
    "Return the signed-in user's recent JetCard activity — saved and removed favorites, shared deals, and venue reviews — each with a timestamp, venue, and action, newest first.",
  inputSchema: {
    limit: z.number().int().min(1).max(100).default(20).describe("Maximum activities to return."),
    since_hours: z
      .number()
      .int()
      .min(1)
      .max(24 * 90)
      .optional()
      .describe("Only include activity from the last N hours (default: no time limit)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit, since_hours }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const userId = ctx.getUserId();
    const since = since_hours ? new Date(Date.now() - since_hours * 3600_000).toISOString() : null;

    const withSince = <T extends { gte: (col: string, v: string) => T }>(q: T, col: string) =>
      since ? q.gte(col, since) : q;

    const [favRes, shareRes, reviewRes] = await Promise.all([
      withSince(
        supabase
          .from("user_favorites")
          .select("created_at, venue_id, venue_name, deal_id")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(limit),
        "created_at",
      ),
      withSince(
        supabase
          .from("deal_shares")
          .select("shared_at, deal_id, deals(venue_id, venue_name, title)")
          .eq("user_id", userId)
          .order("shared_at", { ascending: false })
          .limit(limit),
        "shared_at",
      ),
      withSince(
        supabase
          .from("venue_reviews")
          .select("created_at, venue_id, venue_name, rating, review_text")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(limit),
        "created_at",
      ),
    ]);

    const firstError = favRes.error ?? shareRes.error ?? reviewRes.error;
    if (firstError) {
      return { content: [{ type: "text", text: firstError.message }], isError: true };
    }

    const activities: Activity[] = [];

    for (const row of favRes.data ?? []) {
      activities.push({
        timestamp: row.created_at as string,
        action: "favorite_saved",
        venue_id: (row.venue_id as string) ?? null,
        venue_name: (row.venue_name as string) ?? null,
        details: row.deal_id ? `Saved from deal ${row.deal_id}` : "Saved venue",
      });
    }

    for (const row of shareRes.data ?? []) {
      const deal = (row as { deals?: { venue_id?: string; venue_name?: string; title?: string } | null }).deals;
      activities.push({
        timestamp: row.shared_at as string,
        action: "deal_shared",
        venue_id: deal?.venue_id ?? null,
        venue_name: deal?.venue_name ?? null,
        details: deal?.title ? `Shared deal: ${deal.title}` : "Shared a deal",
      });
    }

    for (const row of reviewRes.data ?? []) {
      activities.push({
        timestamp: row.created_at as string,
        action: "venue_reviewed",
        venue_id: (row.venue_id as string) ?? null,
        venue_name: (row.venue_name as string) ?? null,
        details: `Rated ${row.rating}/5${row.review_text ? `: ${row.review_text}` : ""}`,
      });
    }

    activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const results = activities.slice(0, limit);

    return {
      content: [
        {
          type: "text",
          text: results.length
            ? JSON.stringify(results, null, 2)
            : "No recent activity found for this account.",
        },
      ],
      structuredContent: { activities: results, count: results.length },
    };
  },
});