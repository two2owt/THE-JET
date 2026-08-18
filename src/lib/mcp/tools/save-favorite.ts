import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "save_favorite",
  title: "Save a venue to favorites",
  description:
    "Save a venue (and optionally a specific deal) to the signed-in user's JET-Around favorites.",
  inputSchema: {
    venue_id: z.string().trim().describe("Identifier of the venue to save."),
    venue_name: z.string().trim().describe("Display name of the venue."),
    venue_address: z
      .string()
      .trim()
      .optional()
      .describe("Street address of the venue."),
    venue_category: z
      .string()
      .trim()
      .optional()
      .describe("Category such as food, drink, nightlife, or events."),
    deal_id: z
      .string()
      .uuid()
      .optional()
      .describe("Optional deal id to associate with this favorite."),
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return {
        content: [{ type: "text", text: "Not authenticated" }],
        isError: true,
      };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("user_favorites")
      .insert({ ...input, user_id: ctx.getUserId() })
      .select()
      .maybeSingle();

    if (error)
      return {
        content: [{ type: "text", text: error.message }],
        isError: true,
      };
    return {
      content: [
        { type: "text", text: `Saved ${input.venue_name} to favorites.` },
      ],
      structuredContent: { favorite: data },
    };
  },
});
