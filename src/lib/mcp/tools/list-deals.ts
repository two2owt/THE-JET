import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_deals",
  title: "List active deals",
  description:
    "List currently active JET-Around deals in Charlotte, NC, optionally filtered by a text search over the title, description, or venue name.",
  inputSchema: {
    search: z.string().trim().optional().describe("Optional text to match against deal title, description, or venue name."),
    limit: z.number().int().min(1).max(50).optional().describe("Maximum number of deals to return (default 20)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ search, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const nowIso = new Date().toISOString();
    let query = supabase
      .from("deals")
      .select("id, title, description, deal_type, venue_name, venue_address, starts_at, expires_at, website_url")
      .eq("active", true)
      .lte("starts_at", nowIso)
      .gte("expires_at", nowIso)
      .order("expires_at", { ascending: true })
      .limit(limit ?? 20);

    if (search) {
      const term = search.replace(/[%,]/g, " ").trim();
      query = query.or(
        `title.ilike.%${term}%,description.ilike.%${term}%,venue_name.ilike.%${term}%`,
      );
    }

    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { deals: data ?? [] },
    };
  },
});