/**
 * One-tap deep links into the OS notification settings for this app.
 *
 * Web browsers do not expose a programmatic way to open site settings, so the
 * UI falls back to written steps there. Native shells can jump straight to the
 * app's notification screen.
 */
export function canOpenOsNotificationSettings(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean((window as any).Capacitor?.isNativePlatform?.());
}

export async function openNotificationSettings(): Promise<boolean> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return false;

    const platform = Capacitor.getPlatform();
    if (platform === "ios") {
      // iOS has no notification-specific URL; app-settings: lands on the JET
      // page where Notifications is the first row.
      window.location.href = "app-settings:";
      return true;
    }

    if (platform === "android") {
      const { App } = await import("@capacitor/app");
      const info = await App.getInfo();
      // Per-app notification settings screen.
      window.location.href = `intent:#Intent;action=android.settings.APP_NOTIFICATION_SETTINGS;S.android.provider.extra.APP_PACKAGE=${info.id};end`;
      return true;
    }
  } catch {
    /* fall through */
  }
  return false;
}
