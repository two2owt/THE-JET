/**
 * Unified location + notification permission helpers.
 *
 * - On native (Capacitor iOS/Android) uses the dynamic-imported plugins so the
 *   web bundle stays slim and doesn't crash if the plugin isn't installed.
 * - On web falls back to navigator.geolocation and Notification.requestPermission.
 * - Always returns an actionable result the caller can render directly.
 */
import { toast } from "sonner";
import { isNativeApp, isIOSNative, isAndroidNative, getPlatform } from "@/lib/platform";

/** Capacitor appId — kept in sync with capacitor.config.ts. */
const ANDROID_PACKAGE = "app.lovable.dafac77279084bdb873c58a805d7581e";

/**
 * Open the OS-level app settings screen so the user can flip a blocked
 * permission. iOS uses the documented `app-settings:` URL; Android uses an
 * intent URI pointed at this app's package. Web falls back to a toast hint.
 * Returns true if a settings UI was successfully launched.
 */
export async function openAppSettings(): Promise<boolean> {
  if (!isNativeApp()) {
    toast("Open your browser's site settings", {
      description:
        "Click the lock icon in the address bar to manage permissions for this site.",
      duration: 7000,
    });
    return false;
  }
  try {
    const url = isIOSNative()
      ? "app-settings:"
      : `intent://#Intent;action=android.settings.APPLICATION_DETAILS_SETTINGS;package=${ANDROID_PACKAGE};end`;
    // The native WebView handles `app-settings:` / `intent:` schemes by
    // forwarding them to the OS — no Capacitor plugin call needed.
    window.location.href = url;
    return true;
  } catch (err) {
    console.warn("[permissions] openAppSettings failed", err);
    toast.error("Couldn't open Settings", {
      description: SETTINGS_HINT,
    });
    return false;
  }
}

export type PermissionStatus =
  | "granted"
  | "denied"          // user said no this time — retry possible
  | "blocked"         // user permanently denied — must open Settings
  | "unavailable"     // browser/OS doesn't support it
  | "prompt";         // not asked yet

export interface PermissionResult {
  status: PermissionStatus;
  /** User-facing message describing the state + next step. */
  message: string;
  /** True when the only fix is opening the OS Settings app. */
  requiresSettings: boolean;
}

const SETTINGS_HINT = isIOSNative()
  ? "Open iPhone Settings → JET to enable it."
  : isAndroidNative()
    ? "Open Android Settings → Apps → JET → Permissions to enable it."
    : "Open your browser's site settings to re-enable it.";

function ok(message = "Permission granted."): PermissionResult {
  return { status: "granted", message, requiresSettings: false };
}
function blocked(kind: string): PermissionResult {
  return {
    status: "blocked",
    message: `${kind} access is blocked. ${SETTINGS_HINT}`,
    requiresSettings: true,
  };
}
function denied(kind: string): PermissionResult {
  return {
    status: "denied",
    message: `${kind} permission was denied. You can try again anytime from the prompt.`,
    requiresSettings: false,
  };
}
function unavailable(kind: string): PermissionResult {
  return {
    status: "unavailable",
    message: `${kind} is not supported on this device.`,
    requiresSettings: false,
  };
}

/* ──────────────────────────────  LOCATION  ────────────────────────────── */

export async function requestLocationPermission(): Promise<PermissionResult> {
  if (isNativeApp()) {
    try {
      const { Geolocation } = await import("@capacitor/geolocation");
      const current = await Geolocation.checkPermissions();
      const state = current.location;
      if (state === "granted") return ok();
      if (state === "denied") {
        // iOS/Android return 'denied' both for "not yet asked again" and
        // "permanently blocked"; calling request once more distinguishes.
        const after = await Geolocation.requestPermissions({
          permissions: ["location"],
        });
        if (after.location === "granted") return ok();
        return blocked("Location");
      }
      // 'prompt' or 'prompt-with-rationale'
      const after = await Geolocation.requestPermissions({
        permissions: ["location"],
      });
      if (after.location === "granted") return ok();
      if (after.location === "denied") return blocked("Location");
      return denied("Location");
    } catch (err) {
      console.warn("[permissions] native location request failed", err);
      return unavailable("Location");
    }
  }

  // Web fallback
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return unavailable("Location");
  }
  // Permissions API (where supported) gives us a non-prompting status first.
  try {
    const perms = (navigator as Navigator & {
      permissions?: { query: (d: { name: PermissionName }) => Promise<PermissionStatus & { state: string }> };
    }).permissions;
    if (perms?.query) {
      const s = await perms.query({ name: "geolocation" as PermissionName });
      if (s.state === "granted") return ok();
      if (s.state === "denied") return blocked("Location");
    }
  } catch {
    /* fall through to getCurrentPosition */
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      () => resolve(ok()),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) resolve(blocked("Location"));
        else resolve(denied("Location"));
      },
      { timeout: 10_000, maximumAge: 60_000 },
    );
  });
}

/* ────────────────────────────  NOTIFICATIONS  ─────────────────────────── */

export async function requestNotificationPermission(): Promise<PermissionResult> {
  if (isNativeApp()) {
    try {
      const { PushNotifications } = await import("@capacitor/push-notifications");
      const current = await PushNotifications.checkPermissions();
      if (current.receive === "granted") return ok();
      if (current.receive === "denied") {
        // Try once — iOS will silently no-op if user previously chose "Don't Allow"
        const after = await PushNotifications.requestPermissions();
        if (after.receive === "granted") {
          await PushNotifications.register();
          return ok();
        }
        return blocked("Notifications");
      }
      const after = await PushNotifications.requestPermissions();
      if (after.receive === "granted") {
        await PushNotifications.register();
        return ok();
      }
      if (after.receive === "denied") return blocked("Notifications");
      return denied("Notifications");
    } catch (err) {
      console.warn("[permissions] native push request failed", err);
      return unavailable("Notifications");
    }
  }

  // Web fallback
  if (typeof window === "undefined" || !("Notification" in window)) {
    return unavailable("Notifications");
  }
  if (Notification.permission === "granted") return ok();
  if (Notification.permission === "denied") return blocked("Notifications");
  try {
    const result = await Notification.requestPermission();
    if (result === "granted") return ok();
    if (result === "denied") return blocked("Notifications");
    return denied("Notifications");
  } catch {
    return unavailable("Notifications");
  }
}

/* ───────────────────────────  TOAST HELPERS  ──────────────────────────── */

/**
 * Surface a permission result as a sonner toast with an actionable CTA
 * (re-request, or guidance to open the OS Settings app).
 */
export function toastPermissionResult(
  kind: "Location" | "Notifications",
  result: PermissionResult,
  onRetry?: () => void,
): void {
  if (result.status === "granted") {
    toast.success(`${kind} enabled`);
    return;
  }
  if (result.status === "blocked") {
    toast.error(`${kind} blocked`, {
      description: result.message,
      duration: 10000,
      action: {
        label: "Open Settings",
        onClick: () => {
          void openAppSettings();
        },
      },
    });
    return;
  }
  if (result.status === "unavailable") {
    toast.warning(result.message);
    return;
  }
  // denied / prompt
  toast(`${kind} permission needed`, {
    description: result.message,
    action: onRetry ? { label: "Try again", onClick: onRetry } : undefined,
    duration: 7000,
  });
}

export { getPlatform };