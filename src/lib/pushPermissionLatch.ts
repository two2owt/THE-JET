/**
 * Sticky "the user already allowed notifications on this device" latch.
 *
 * Mirrors the PWA install latch: once permission is granted we never show the
 * explanatory push prompt again — not on a later sign-in, sign-up, or session —
 * unless the user actually revokes the permission at the browser/OS level, in
 * which case the latch is cleared and priming may happen again.
 */
const GRANTED_KEY = "push-notification-permission-granted";

export function hasPushGrantLatch(): boolean {
  try {
    return typeof window !== "undefined" &&
      localStorage.getItem(GRANTED_KEY) === "1";
  } catch {
    return false;
  }
}

export function setPushGrantLatch() {
  try {
    localStorage.setItem(GRANTED_KEY, "1");
  } catch {
    /* storage blocked */
  }
}

export function clearPushGrantLatch() {
  try {
    localStorage.removeItem(GRANTED_KEY);
  } catch {
    /* storage blocked */
  }
}

/**
 * Keeps the latch in sync with the live permission state.
 * `permission` is the platform permission ("granted" | "denied" | "default" |
 * "prompt" | unknown). Anything other than granted means the previous grant no
 * longer holds, so the latch is dropped.
 */
export function syncPushGrantLatch(permission: string | null | undefined) {
  if (!permission) return;
  if (permission === "granted") setPushGrantLatch();
  else if (permission === "denied" || permission === "default" || permission === "prompt")
    clearPushGrantLatch();
}

export const PUSH_GRANTED_KEY = GRANTED_KEY;
