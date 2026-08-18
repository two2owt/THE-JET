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
const KEY = "jet:pending-deep-link";

let memory: string | null = null;

export function queueDeepLink(target: string | null | undefined) {
  if (!target) return;
  memory = target;
  try {
    sessionStorage.setItem(KEY, target);
  } catch {
    /* private mode — memory copy is enough */
  }
}

export function consumeDeepLink(): string | null {
  let target = memory;
  if (!target) {
    try {
      target = sessionStorage.getItem(KEY);
    } catch {
      target = null;
    }
  }
  memory = null;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  return target;
}

export function peekDeepLink(): string | null {
  if (memory) return memory;
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}
