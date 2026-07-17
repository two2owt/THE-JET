/**
 * Native (Capacitor) push notification lifecycle.
 *
 * On iOS/Android:
 *   1. Requests permission from the OS.
 *   2. Registers with APNs/FCM and captures the device token.
 *   3. Upserts the token into `push_subscriptions` so the server can
 *      fan out via FCM (see merchant-send-notification / notify-favorite-update).
 *   4. Handles taps on delivered notifications and routes into the
 *      correct heatmap state via the shared deep-link resolver.
 *
 * On web: no-op — `useWebPushNotifications` handles the browser side.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { supabase } from "@/integrations/supabase/client";
import { resolvePushDeepLink } from "@/lib/pushDeepLink";

function isNativeShell() {
  return (
    typeof window !== "undefined" &&
    // @ts-expect-error injected by Capacitor at runtime
    (window.Capacitor?.isNativePlatform?.() ?? false)
  );
}

export const usePushNotifications = () => {
  const navigate = useNavigate();
  const [isRegistered, setIsRegistered] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const initedRef = useRef(false);

  const persistToken = useCallback(async (deviceToken: string, platform: "ios" | "android") => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("push_subscriptions").upsert(
      {
        user_id: user.id,
        endpoint: deviceToken,
        p256dh_key: "native",
        auth_key: "native",
        platform,
        active: true,
      },
      { onConflict: "endpoint" },
    );
  }, []);

  const initializePushNotifications = useCallback(async () => {
    if (initedRef.current || !isNativeShell()) return;
    initedRef.current = true;
    try {
      const { PushNotifications } = await import("@capacitor/push-notifications");
      // @ts-expect-error runtime
      const platform = (window.Capacitor?.getPlatform?.() ?? "android") as "ios" | "android";

      let perm = await PushNotifications.checkPermissions();
      if (perm.receive !== "granted") {
        perm = await PushNotifications.requestPermissions();
      }
      if (perm.receive !== "granted") return;

      await PushNotifications.register();

      await PushNotifications.addListener("registration", async (t) => {
        setToken(t.value);
        setIsRegistered(true);
        try {
          await persistToken(t.value, platform);
        } catch (err) {
          console.error("[push] token persist failed", err);
        }
      });

      await PushNotifications.addListener("registrationError", (err) => {
        console.error("[push] registration error", err);
      });

      // Foreground receipt — surface as a lightweight toast route is left
      // to the app; the OS handles background delivery natively.
      await PushNotifications.addListener("pushNotificationReceived", (notif) => {
        console.log("[push] received", notif);
      });

      // User tapped the notification → route into the correct heatmap state.
      await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
        const data = (action.notification?.data ?? {}) as Record<string, string>;
        const target = resolvePushDeepLink(data);
        if (target) navigate(target);
      });
    } catch (err) {
      console.error("[push] init failed", err);
    }
  }, [navigate, persistToken]);

  const unregister = useCallback(async () => {
    if (!isNativeShell()) return;
    try {
      const { PushNotifications } = await import("@capacitor/push-notifications");
      await PushNotifications.removeAllListeners();
      if (token) {
        await supabase
          .from("push_subscriptions")
          .update({ active: false })
          .eq("endpoint", token);
      }
      setIsRegistered(false);
    } catch (err) {
      console.error("[push] unregister failed", err);
    }
  }, [token]);

  const checkPermissions = useCallback(async () => {
    if (!isNativeShell()) return false;
    try {
      const { PushNotifications } = await import("@capacitor/push-notifications");
      const perm = await PushNotifications.checkPermissions();
      return perm.receive === "granted";
    } catch {
      return false;
    }
  }, []);

  // Auto-init on native shells once the user is authenticated.
  useEffect(() => {
    if (!isNativeShell()) return;
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      if (session?.user) void initializePushNotifications();
    });
    // Also run immediately if already signed in.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) void initializePushNotifications();
    });
    return () => sub.subscription.unsubscribe();
  }, [initializePushNotifications]);

  return {
    isRegistered,
    token,
    isNative: isNativeShell(),
    initializePushNotifications,
    unregister,
    checkPermissions,
  };
};
