/**
 * Native push notifications for iOS + Android via Capacitor +
 * `@capacitor/push-notifications`. On both platforms the plugin returns an
 * FCM device token (iOS uses Firebase to bridge to APNs), which we persist in
 * `push_subscriptions` so the `notify-new-message` / `send-push-notification`
 * edge functions can target the right devices.
 *
 * On web this hook is a no-op (returns `isNative: false`). Web push is
 * handled by `useWebPushNotifications`.
 */
import { useCallback, useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";

type PushPlugin = typeof import("@capacitor/push-notifications").PushNotifications;

const isNativePlatform = (): boolean => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

let cachedPlugin: PushPlugin | null = null;
async function getPlugin(): Promise<PushPlugin | null> {
  if (!isNativePlatform()) return null;
  if (cachedPlugin) return cachedPlugin;
  const mod = await import("@capacitor/push-notifications");
  cachedPlugin = mod.PushNotifications;
  return cachedPlugin;
}

let listenersAttached = false;
let currentToken: string | null = null;

async function saveToken(token: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const platform = Capacitor.getPlatform(); // 'ios' | 'android' | 'web'
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: token,
      // FCM tokens don't use VAPID keys; keep columns non-null with empty strings.
      p256dh_key: "",
      auth_key: "",
      platform,
      active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,endpoint" },
  );
  if (error) console.error("[push] failed to save token:", error);
}

async function attachListeners(plugin: PushPlugin) {
  if (listenersAttached) return;
  listenersAttached = true;

  plugin.addListener("registration", (token) => {
    currentToken = token.value;
    void saveToken(token.value);
  });

  plugin.addListener("registrationError", (err) => {
    console.error("[push] registration error:", err);
  });

  // Foreground arrival — the global PushDeepLinkBridge surfaces deep links;
  // we only log here so we don't double-handle navigation.
  plugin.addListener("pushNotificationReceived", (notification) => {
    console.log("[push] received:", notification);
  });

  // Background tap — also handled by PushDeepLinkBridge for navigation.
  plugin.addListener("pushNotificationActionPerformed", (action) => {
    console.log("[push] action performed:", action.notification?.data);
  });
}

export const usePushNotifications = () => {
  const [isNative] = useState(isNativePlatform);
  const [isRegistered, setIsRegistered] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  // Reflect cached token on mount so settings UI shows the correct state.
  useEffect(() => {
    if (!isNative) return;
    setToken(currentToken);
    setIsRegistered(!!currentToken);
  }, [isNative]);

  const initializePushNotifications = useCallback(async () => {
    const plugin = await getPlugin();
    if (!plugin) return;
    const perm = await plugin.requestPermissions();
    if (perm.receive !== "granted") {
      throw new Error("Push notifications permission denied");
    }
    await attachListeners(plugin);
    await plugin.register();
    setIsRegistered(true);
    // The registration listener will populate currentToken; sync local state.
    setTimeout(() => setToken(currentToken), 0);
  }, []);

  const unregister = useCallback(async () => {
    const plugin = await getPlugin();
    if (!plugin) return;
    try {
      // Mark the current token inactive server-side; we leave the row so
      // history (delivery logs) remains intact.
      if (currentToken) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase
            .from("push_subscriptions")
            .update({ active: false })
            .eq("user_id", user.id)
            .eq("endpoint", currentToken);
        }
      }
      await plugin.removeAllListeners();
      listenersAttached = false;
      currentToken = null;
      setIsRegistered(false);
      setToken(null);
    } catch (err) {
      console.error("[push] unregister failed:", err);
    }
  }, []);

  const checkPermissions = useCallback(async () => {
    const plugin = await getPlugin();
    if (!plugin) return false;
    const perm = await plugin.checkPermissions();
    return perm.receive === "granted";
  }, []);

  return {
    isRegistered,
    token,
    isNative,
    initializePushNotifications,
    unregister,
    checkPermissions,
  };
};
