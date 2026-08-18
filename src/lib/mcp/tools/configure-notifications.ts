import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

const PREF_COLUMNS =
  "notifications_enabled, email_notifications_enabled, background_tracking_enabled, location_tracking_enabled, auto_reload_updates, updated_at";

export default defineTool({
  name: "configure_notifications",
  title: "Configure notifications",
  description:
    "Read or change the signed-in user's notification settings. Call with no arguments to read current settings; pass any of push_enabled, email_enabled, background_location_alerts, location_tracking, or auto_reload_updates to enable/disable that type.",
  inputSchema: {
    push_enabled: z
      .boolean()
      .optional()
      .describe("Master switch for in-app/device push notifications."),
    email_enabled: z
      .boolean()
      .optional()
      .describe(
        "Email notifications (friend requests, direct messages, deal updates).",
      ),
    background_location_alerts: z
      .boolean()
      .optional()
      .describe(
        "Background geofence alerts when near favorite venues (requires location tracking).",
      ),
    location_tracking: z
      .boolean()
      .optional()
      .describe("Foreground location tracking used for nearby deal alerts."),
    auto_reload_updates: z
      .boolean()
      .optional()
      .describe(
        "Automatically apply app updates when a new version is available.",
      ),
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

    const updates: Record<string, boolean> = {};
    if (input.push_enabled !== undefined)
      updates.notifications_enabled = input.push_enabled;
    if (input.email_enabled !== undefined)
      updates.email_notifications_enabled = input.email_enabled;
    if (input.background_location_alerts !== undefined)
      updates.background_tracking_enabled = input.background_location_alerts;
    if (input.location_tracking !== undefined)
      updates.location_tracking_enabled = input.location_tracking;
    if (input.auto_reload_updates !== undefined)
      updates.auto_reload_updates = input.auto_reload_updates;

    // Background alerts are meaningless without location tracking; keep them consistent.
    if (
      updates.background_tracking_enabled === true &&
      updates.location_tracking_enabled === undefined
    ) {
      updates.location_tracking_enabled = true;
    }
    if (updates.location_tracking_enabled === false) {
      updates.background_tracking_enabled = false;
    }

    if (Object.keys(updates).length > 0) {
      const { error } = await supabase
        .from("user_preferences")
        .upsert({ user_id: userId, ...updates }, { onConflict: "user_id" });
      if (error) {
        return {
          content: [{ type: "text", text: error.message }],
          isError: true,
        };
      }
    }

    const { data, error } = await supabase
      .from("user_preferences")
      .select(PREF_COLUMNS)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      return {
        content: [{ type: "text", text: error.message }],
        isError: true,
      };
    }

    const settings = {
      push_enabled: data?.notifications_enabled ?? false,
      email_enabled: data?.email_notifications_enabled ?? false,
      background_location_alerts: data?.background_tracking_enabled ?? false,
      location_tracking: data?.location_tracking_enabled ?? false,
      auto_reload_updates: data?.auto_reload_updates ?? false,
      updated_at: data?.updated_at ?? null,
      changed: Object.keys(updates).length > 0,
    };

    return {
      content: [{ type: "text", text: JSON.stringify(settings, null, 2) }],
      structuredContent: { settings },
    };
  },
});
