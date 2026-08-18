import { supabase } from "@/integrations/supabase/client";

/**
 * Marks an inbox notification as read when its push alert is tapped, so the
 * Alerts tab / badge stay in sync with what the user actually opened.
 *
 * The push payload's `notificationId` may point at either a `notification_logs`
 * row (legacy per-user log) or a `notification_deliveries` row (queue bus), so
 * we optimistically touch both and let RLS drop the one that doesn't apply.
 */
const seen = new Set<string>();

export async function syncNotificationRead(
  notificationId: string | null | undefined,
) {
  if (!notificationId || seen.has(notificationId)) return;
  seen.add(notificationId);

  try {
    await Promise.allSettled([
      supabase
        .from("notification_logs")
        .update({ read: true })
        .eq("id", notificationId),
      supabase
        .from("notification_deliveries")
        .update({ status: "opened", opened_at: new Date().toISOString() })
        .eq("id", notificationId),
    ]);
  } catch {
    /* best-effort */
  }

  try {
    window.dispatchEvent(new CustomEvent("jet:notifications-refresh"));
  } catch {
    /* non-browser context */
  }
}
