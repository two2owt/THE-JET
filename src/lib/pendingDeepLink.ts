/**
 * Cold-start deep-link buffer.
 *
 * When a push notification is tapped while the app is closed, the OS launches
 * the shell and fires `pushNotificationActionPerformed` (native) or opens a
 * new window (web) BEFORE React/the router has mounted. Navigating at that
 * moment is a no-op, so the tap silently lands on the map instead of the
 * JetCard. We park the resolved target here and flush it once the router is
 * ready. sessionStorage keeps it alive across the launch reload.
 */
import { hasProcessedAlert } from "@/lib/notificationIdempotency";

const KEY = "jet:pending-deep-link";

export type PendingDeepLink = {
  target: string;
  /** Inbox row id from the push payload, so we can mark it read on open. */
  notificationId?: string | null;
};

let memory: PendingDeepLink | null = null;

function parse(raw: string | null): PendingDeepLink | null {
  if (!raw) return null;
  if (raw.startsWith("{")) {
    try {
      const parsed = JSON.parse(raw) as PendingDeepLink;
      return parsed?.target ? parsed : null;
    } catch {
      return null;
    }
  }
  return { target: raw };
}

export function queueDeepLink(
  target: string | null | undefined,
  notificationId?: string | null,
) {
  if (!target) return;
  // The OS can replay the same tap (relaunch + resume). Once an alert has been
  // navigated for, never re-queue it.
  if (hasProcessedAlert("nav", notificationId)) return;
  memory = { target, notificationId: notificationId ?? null };
  try {
    sessionStorage.setItem(KEY, JSON.stringify(memory));
  } catch {
    /* private mode — memory copy is enough */
  }
  try {
    window.dispatchEvent(new CustomEvent("jet:deep-link-queued"));
  } catch {
    /* non-browser context */
  }
}

export function consumeDeepLink(): PendingDeepLink | null {
  let entry = memory;
  if (!entry) {
    try {
      entry = parse(sessionStorage.getItem(KEY));
    } catch {
      entry = null;
    }
  }
  memory = null;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  return entry;
}

export function peekDeepLink(): string | null {
  if (memory) return memory.target;
  try {
    return parse(sessionStorage.getItem(KEY))?.target ?? null;
  } catch {
    return null;
  }
}
