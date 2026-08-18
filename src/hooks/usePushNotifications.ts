/**
 * Native (Capacitor) push notification lifecycle for the iOS / Android shells.
 *
 *   1. Tracks the OS permission state (`prompt` / `granted` / `denied`).
 *   2. Requests permission ONLY from an explicit user action (`enable()`),
 *      never automatically — App Store / Play policy plus our consent model.
 *   3. Registers with APNs/FCM, captures the device token and upserts it into
 *      `push_subscriptions` so the merchant portal fan-out
 *      (merchant-send-notification / notify-favorite-update) can reach it.
 *   4. Handles foreground receipt and notification taps via the shared
 *      deep-link resolver.
 *   5. Deactivates the token on sign-out / disable so pushes stop immediately.
 *
 * On web this is a no-op — `useWebPushNotifications` handles the browser side.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { resolvePushDeepLink } from "@/lib/pushDeepLink";
import { hasConsent, setConsent } from "@/lib/consent";
import { toast } from "sonner";

export type NativePushPermission = "prompt" | "granted" | "denied";

function isNativeShell() {
  return (
    typeof window !== "undefined" &&
    // @ts-expect-error injected by Capacitor at runtime
    (window.Capacitor?.isNativePlatform?.() ?? false)
  );
}

function nativePlatform(): "ios" | "android" {
  // @ts-expect-error injected by Capacitor at runtime
  return (window.Capacitor?.getPlatform?.() ?? "android") as "ios" | "android";
}

async function loadPlugin() {
  const { PushNotifications } = await import("@capacitor/push-notifications");
  return PushNotifications;
}

/** Map the plugin's permission state onto our tri-state. */
function toPermission(receive: string): NativePushPermission {
  if (receive === "granted") return "granted";
  if (receive === "denied") return "denied";
  return "prompt";
}

export const usePushNotifications = () => {
  const navigate = useNavigate();
  const isNative = isNativeShell();
  const [isRegistered, setIsRegistered] = useState(false);
  const [permission, setPermission] = useState<NativePushPermission>("prompt");
  const [isLoading, setIsLoading] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  const listenersRef = useRef(false);

  const persistToken = useCallback(
    async (deviceToken: string, platform: "ios" | "android") => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      // No unique constraint on `endpoint` — do a manual find-or-update.
      const { data: existing } = await supabase
        .from("push_subscriptions")
        .select("id")
        .eq("endpoint", deviceToken)
        .maybeSingle();
      if (existing?.id) {
        await supabase
          .from("push_subscriptions")
          .update({ user_id: user.id, platform, active: true })
          .eq("id", existing.id);
      } else {
        await supabase.from("push_subscriptions").insert({
          user_id: user.id,
          endpoint: deviceToken,
          p256dh_key: "native",
          auth_key: "native",
          platform,
          active: true,
        });
      }
    },
    [],
  );

  const deactivateToken = useCallback(async () => {
    const current = tokenRef.current;
    if (!current) return;
    await supabase
      .from("push_subscriptions")
      .update({ active: false })
      .eq("endpoint", current);
  }, []);

  /** Attach the plugin listeners exactly once per app session. */
  const attachListeners = useCallback(async () => {
    if (listenersRef.current || !isNativeShell()) return;
    listenersRef.current = true;
    const PushNotifications = await loadPlugin();
    const platform = nativePlatform();

    await PushNotifications.addListener("registration", async (t) => {
      tokenRef.current = t.value;
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
      setIsRegistered(false);
    });

    // Foreground on native: surface the alert in-app with a deep-link action.
    await PushNotifications.addListener(
      "pushNotificationReceived",
      (notif) => {
        const data = (notif?.data ?? {}) as Record<string, string>;
        const target = resolvePushDeepLink(data);
        toast(notif?.title || "New JET alert", {
          description: notif?.body || undefined,
          action: target
            ? { label: "View", onClick: () => navigate(target) }
            : undefined,
        });
        window.dispatchEvent(new CustomEvent("jet:notifications-refresh"));
      },
    );

    // Tap → route into the matching heatmap / JetCard state.
    await PushNotifications.addListener(
      "pushNotificationActionPerformed",
      (action) => {
        const data = (action.notification?.data ?? {}) as Record<
          string,
          string
        >;
        if (data.notificationId) {
          void supabase.functions
            .invoke("notifications-receipt", {
              body: { notificationId: data.notificationId },
            })
            .catch(() => {});
        }
        const target = resolvePushDeepLink(data);
        if (target) navigate(target);
      },
    );
  }, [navigate, persistToken]);

  const checkPermissions = useCallback(async (): Promise<boolean> => {
    if (!isNativeShell()) return false;
    try {
      const PushNotifications = await loadPlugin();
      const perm = await PushNotifications.checkPermissions();
      const next = toPermission(perm.receive);
      setPermission(next);
      return next === "granted";
    } catch {
      return false;
    }
  }, []);

  /**
   * Silent re-registration path: only runs when the OS permission is ALREADY
   * granted and the user's `push_notifications` consent row is intact. Keeps
   * the device token fresh (APNs/FCM rotate them) without ever prompting.
   */
  const initializePushNotifications = useCallback(async () => {
    if (!isNativeShell()) return;
    try {
      const PushNotifications = await loadPlugin();
      const perm = await PushNotifications.checkPermissions();
      setPermission(toPermission(perm.receive));
      if (perm.receive !== "granted") return;
      if (!hasConsent("push_notifications")) return;
      await attachListeners();
      await PushNotifications.register();
    } catch (err) {
      console.error("[push] init failed", err);
    }
  }, [attachListeners]);

  /** Explicit opt-in from a user gesture. Requests the OS prompt. */
  const enable = useCallback(async (): Promise<boolean> => {
    if (!isNativeShell()) return false;
    setIsLoading(true);
    try {
      const PushNotifications = await loadPlugin();
      let perm = await PushNotifications.checkPermissions();
      if (perm.receive !== "granted") {
        perm = await PushNotifications.requestPermissions();
      }
      setPermission(toPermission(perm.receive));
      if (perm.receive !== "granted") {
        toast.error("Alerts are turned off for JET", {
          description:
            "Enable notifications for JET in your device settings, then try again.",
        });
        return false;
      }
      await setConsent("push_notifications", true, "native_push_enable");
      await attachListeners();
      await PushNotifications.register();
      return true;
    } catch (err) {
      console.error("[push] enable failed", err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [attachListeners]);

  /** Explicit opt-out: stop delivery and drop the consent row. */
  const disable = useCallback(async (): Promise<void> => {
    if (!isNativeShell()) return;
    setIsLoading(true);
    try {
      await deactivateToken();
      await setConsent("push_notifications", false, "native_push_disable");
      setIsRegistered(false);
    } catch (err) {
      console.error("[push] disable failed", err);
    } finally {
      setIsLoading(false);
    }
  }, [deactivateToken]);

  // Back-compat alias used by the settings panel.
  const unregister = disable;

  useEffect(() => {
    if (!isNativeShell()) return;
    void checkPermissions();

    const { data: sub } = supabase.auth.onAuthStateChange((evt, session) => {
      if (evt === "SIGNED_OUT") {
        void deactivateToken().finally(() => {
          tokenRef.current = null;
          setToken(null);
          setIsRegistered(false);
        });
        return;
      }
      if (session?.user) void initializePushNotifications();
    });

    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) void initializePushNotifications();
    });

    return () => sub.subscription.unsubscribe();
  }, [checkPermissions, deactivateToken, initializePushNotifications]);

  return {
    isNative,
    isRegistered,
    isLoading,
    permission,
    token,
    enable,
    disable,
    unregister,
    initializePushNotifications,
    checkPermissions,
  };
};
