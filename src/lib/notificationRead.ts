import { supabase } from "@/integrations/supabase/client";
import { claimAlert, releaseAlert } from "@/lib/notificationIdempotency";

/**
 * Marks an inbox notification as read when its push alert is tapped, so the
 * Alerts tab / badge stay in sync with what the user actually opened.
 *
 * The push payload's `notificationId` may point at either a `notification_logs`
 * row (legacy per-user log) or a `notification_deliveries` row (queue bus), so
 * we optimistically touch both and let RLS drop the one that doesn't apply.
 */
export async function syncNotificationRead(
  notificationId: string | null | undefined,
) {
  if (!notificationId) return;
  // Durable claim: survives reloads, so the SW `?nid=` path and the deep-link
  // queue can't both mark the same alert read.
  if (!claimAlert("read", notificationId)) return;

  try {
    const results = await Promise.allSettled([
      supabase
        .from("notification_logs")
        .update({ read: true })
        .eq("id", notificationId),
      supabase
        .from("notification_deliveries")
        .update({ status: "opened", opened_at: new Date().toISOString() })
        .eq("id", notificationId),
    ]);
    // If neither write landed (offline / transient), allow a later retry.
    const anyOk = results.some(
      (r) => r.status === "fulfilled" && !(r.value as { error?: unknown })?.error,
    );
    if (!anyOk) releaseAlert("read", notificationId);
  } catch {
    releaseAlert("read", notificationId);
  }

  try {
    window.dispatchEvent(new CustomEvent("jet:notifications-refresh"));
  } catch {
    /* non-browser context */
  }
}
