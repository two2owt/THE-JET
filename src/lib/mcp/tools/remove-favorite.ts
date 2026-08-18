import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "remove_favorite",
  title: "Remove a saved venue",
  description:
    "Remove a saved venue from the signed-in user's JET-Around favorites by favorite id or venue id.",
  inputSchema: {
    favorite_id: z
      .string()
      .uuid()
      .optional()
      .describe("Id of the favorite row to remove."),
    venue_id: z
      .string()
      .trim()
      .optional()
      .describe(
        "Venue id to remove from favorites when the favorite id is unknown.",
      ),
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: async ({ favorite_id, venue_id }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return {
        content: [{ type: "text", text: "Not authenticated" }],
        isError: true,
      };
    }
    if (!favorite_id && !venue_id) {
      return {
        content: [{ type: "text", text: "Provide favorite_id or venue_id." }],
        isError: true,
      };
    }
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("user_favorites")
      .delete()
      .eq("user_id", ctx.getUserId());
    query = favorite_id
      ? query.eq("id", favorite_id)
      : query.eq("venue_id", venue_id as string);

    const { data, error } = await query.select("id");
    if (error)
      return {
        content: [{ type: "text", text: error.message }],
        isError: true,
      };
    return {
      content: [
        { type: "text", text: `Removed ${data?.length ?? 0} favorite(s).` },
      ],
      structuredContent: { removed: data?.length ?? 0 },
    };
  },
});
