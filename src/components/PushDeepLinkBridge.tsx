import { useEffect } from "react";
import { useNavigate } from "react-router";
import { Capacitor } from "@capacitor/core";

/**
 * Mounts inside the router and forwards native-push taps to the SPA's
 * client-side navigation. The edge function attaches `data.deep_link` (a
 * relative URL like `/messages?chat=<senderId>`) to every push payload;
 * tapping the notification opens the chat thread instead of bouncing the
 * user to the root route.
 *
 * Web is unaffected — service-worker deep links continue to flow through
 * `useDeepLinking`'s message listener.
 */
export function PushDeepLinkBridge() {
  const navigate = useNavigate();

  useEffect(() => {
    let isNative = false;
    try {
      isNative = Capacitor.isNativePlatform();
    } catch {
      isNative = false;
    }
    if (!isNative) return;

    let removed = false;
    const handles: Array<{ remove: () => Promise<void> | void }> = [];

    const followDeepLink = (raw: unknown) => {
      if (typeof raw !== "string" || !raw) return;
      try {
        // Allow either absolute or relative URLs; only same-origin is honored.
        const target = new URL(raw, window.location.origin);
        if (target.origin !== window.location.origin) return;
        navigate(`${target.pathname}${target.search}${target.hash}`);
      } catch {
        // Treat as relative path fallback.
        if (raw.startsWith("/")) navigate(raw);
      }
    };

    (async () => {
      const { PushNotifications } = await import("@capacitor/push-notifications");
      if (removed) return;

      // Tap on a delivered notification (background → foreground).
      handles.push(
        await PushNotifications.addListener(
          "pushNotificationActionPerformed",
          (action) => followDeepLink(action.notification?.data?.deep_link),
        ),
      );

      // In-foreground arrival: don't auto-navigate, just let the in-app
      // notification UI handle it. We could surface a toast here if desired.
    })().catch((err) => console.error("[PushDeepLinkBridge] init failed:", err));

    return () => {
      removed = true;
      handles.forEach((h) => {
        try {
          h.remove();
        } catch {}
      });
    };
  }, [navigate]);

  return null;
}