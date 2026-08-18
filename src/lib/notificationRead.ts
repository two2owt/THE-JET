import { claimAlert } from "@/lib/notificationIdempotency";
import {
  enqueueRead,
  writeRead,
  type ReadSource,
} from "@/lib/notificationReadQueue";

/**
 * Marks an inbox notification as read when its push alert is tapped, so the
 * Alerts tab / badge stay in sync with what the user actually opened.
 *
 * The push payload's `notificationId` may point at either a `notification_logs`
 * row (legacy per-user log) or a `notification_deliveries` row (queue bus), so
 * we optimistically touch both and let RLS drop the one that doesn't apply.
 *
 * Failures (offline, transient network) are handed to a persisted retry queue
 * instead of being dropped — the optimistic UI already shows it as read.
 */
export async function syncNotificationRead(
  notificationId: string | null | undefined,
  /** When known, only the owning table is touched. */
  source?: ReadSource,
) {
  if (!notificationId) return;
  // Durable claim: survives reloads, so the SW `?nid=` path and the deep-link
  // queue can't both mark the same alert read.
  if (!claimAlert("read", notificationId)) return;

  let ok = false;
  try {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      ok = false;
    } else {
      ok = await writeRead(notificationId, source);
    }
  } catch {
    ok = false;
  }
  if (!ok) enqueueRead(notificationId, source);

  try {
    window.dispatchEvent(new CustomEvent("jet:notifications-refresh"));
  } catch {
    /* non-browser context */
  }
}
