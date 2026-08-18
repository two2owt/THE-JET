import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

type Topics = {
  jetcard_updates: boolean;
  merchant_offers: boolean;
  favorite_venue_alerts: boolean;
  ending_soon_reminders: boolean;
  direct_messages: boolean;
};

const DEFAULT_TOPICS: Topics = {
  jetcard_updates: true,
  merchant_offers: true,
  favorite_venue_alerts: true,
  ending_soon_reminders: true,
  direct_messages: true,
};

const topicFlag = (label: string) => z.boolean().optional().describe(label);

export default defineTool({
  name: "push_preferences",
  title: "Push notification preferences",
  description:
    "View or update the signed-in user's push notification preferences for JetCard updates and merchant offers. Call with no arguments to read current settings; pass any flag to change it.",
  inputSchema: {
    push_enabled: topicFlag(
      "Master device push switch. Turning this off silences all push topics.",
    ),
    jetcard_updates: topicFlag(
      "Push about JetCard membership/status changes and account updates.",
    ),
    merchant_offers: topicFlag(
      "Push when merchants activate new deals or offers.",
    ),
    favorite_venue_alerts: topicFlag(
      "Push when a saved/favorite venue posts or updates a deal.",
    ),
    ending_soon_reminders: topicFlag(
      "Push when a saved deal is about to expire.",
    ),
    direct_messages: topicFlag("Push for direct messages from other users."),
  },
  annotations: {
    readOnlyHint: false,
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
    const userId = ctx.getUserId();

    // --- master push switch lives on user_preferences ---
    if (input.push_enabled !== undefined) {
      const { error } = await supabase
        .from("user_preferences")
        .upsert(
          { user_id: userId, notifications_enabled: input.push_enabled },
          { onConflict: "user_id" },
        );
      if (error)
        return {
          content: [{ type: "text", text: error.message }],
          isError: true,
        };
    }

    // --- topic switches live on profiles.preferences.push_topics ---
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("preferences")
      .eq("id", userId)
      .maybeSingle();
    if (profileError) {
      return {
        content: [{ type: "text", text: profileError.message }],
        isError: true,
      };
    }

    const prefs = (profile?.preferences ?? {}) as Record<string, unknown>;
    const stored = (prefs.push_topics ?? {}) as Partial<Topics>;
    const topics: Topics = { ...DEFAULT_TOPICS, ...stored };

    const changedTopics: string[] = [];
    for (const key of Object.keys(DEFAULT_TOPICS) as Array<keyof Topics>) {
      const next = input[key];
      if (next !== undefined && topics[key] !== next) {
        topics[key] = next;
        changedTopics.push(key);
      }
    }

    if (changedTopics.length > 0) {
      const { error } = await supabase
        .from("profiles")
        .update({ preferences: { ...prefs, push_topics: topics } })
        .eq("id", userId);
      if (error)
        return {
          content: [{ type: "text", text: error.message }],
          isError: true,
        };
    }

    const { data: userPrefs, error: prefsError } = await supabase
      .from("user_preferences")
      .select("notifications_enabled, updated_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (prefsError) {
      return {
        content: [{ type: "text", text: prefsError.message }],
        isError: true,
      };
    }

    const pushEnabled = userPrefs?.notifications_enabled ?? false;
    const result = {
      push_enabled: pushEnabled,
      topics,
      effective_topics: Object.fromEntries(
        Object.entries(topics).map(([k, v]) => [k, pushEnabled && v]),
      ),
      changed: [
        ...(input.push_enabled !== undefined ? ["push_enabled"] : []),
        ...changedTopics,
      ],
      updated_at: userPrefs?.updated_at ?? null,
      note: pushEnabled
        ? undefined
        : "Device push is off, so no topics will deliver until push_enabled is set to true.",
    };

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result,
    };
  },
});
