/**
 * Stable per-install device identifier.
 *
 * APNs/FCM reissue device tokens (app restore, reinstall, key rotation, or a
 * plain silent refresh), so the token itself can never identify a device over
 * time. This id does: it is minted once per install and lets the server
 * overwrite the *same* device's row in `push_notifications` when a refreshed
 * token arrives, instead of accumulating dead subscriptions.
 */
const DEVICE_ID_KEY = "jet:device-id";

function mint(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
  } catch {
    /* ignore */
  }
  return `dev_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

/** Returns the persisted device id, minting and storing one on first call. */
export function getDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing && existing.trim()) return existing.trim();
    const next = mint();
    localStorage.setItem(DEVICE_ID_KEY, next);
    return next;
  } catch {
    // Private mode / storage disabled: still return a value so the current
    // session's rotation works, it just will not survive a restart.
    return mint();
  }
}
