import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_favorites",
  title: "List my saved venues",
  description:
    "List the venues and deals the signed-in user has saved to their JET-Around favorites.",
  inputSchema: {
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe("Maximum number of favorites to return (default 50)."),
  },
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: async ({ limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return {
        content: [{ type: "text", text: "Not authenticated" }],
        isError: true,
      };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("user_favorites")
      .select(
        "id, venue_id, venue_name, venue_address, venue_category, venue_neighborhood, deal_id, created_at",
      )
      .eq("user_id", ctx.getUserId())
      .order("created_at", { ascending: false })
      .limit(limit ?? 50);

    if (error)
      return {
        content: [{ type: "text", text: error.message }],
        isError: true,
      };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { favorites: data ?? [] },
    };
  },
});
