/**
 * Native (Capacitor) push notification lifecycle for the iOS / Android shells.
 *
 *   1. Tracks the OS permission state (`prompt` / `granted` / `denied`).
 *   2. Requests permission ONLY from an explicit user action (`enable()`),
 *      never automatically — App Store / Play policy plus our consent model.
 *   3. Registers with APNs/FCM, captures the device token and upserts it into
 *      `push_notifications` so the merchant portal fan-out
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
import { queueDeepLink } from "@/lib/pendingDeepLink";
import { getExplicitConsent, setConsent } from "@/lib/consent";
import { toast } from "sonner";
import { registerDeviceToken } from "@/lib/device-tokens.functions";
import { getDeviceId } from "@/lib/device-id";

export type NativePushPermission = "prompt" | "granted" | "denied";

/** Last token this device registered — used to detect APNs/FCM rotation. */
const LAST_TOKEN_KEY = "jet:push-last-token";

function readLastToken(): string | null {
  try {
    return localStorage.getItem(LAST_TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeLastToken(value: string) {
  try {
    localStorage.setItem(LAST_TOKEN_KEY, value);
  } catch {
    /* ignore */
  }
}

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
  /** Guards against overlapping register() calls (launch + resume + auth). */
  const registeringRef = useRef(false);
  /** User the current device token was last persisted for. */
  const persistedForRef = useRef<string | null>(null);
  /** Token value last successfully written for this device. */
  const persistedTokenRef = useRef<string | null>(null);

  const persistToken = useCallback(
    async (deviceToken: string, platform: "ios" | "android") => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      persistedForRef.current = user.id;
      const deviceId = getDeviceId();

      // Preferred path: one authenticated server call does the rotation +
      // find-or-update atomically, so a device never leaves duplicate or
      // stale rows behind. Falls back to the direct client writes below if
      // the RPC is unreachable (offline shell, cold worker).
      try {
        await registerDeviceToken({
          data: {
            token: deviceToken,
            platform,
            previousToken: readLastToken(),
            deviceId,
          },
        });
        writeLastToken(deviceToken);
        persistedTokenRef.current = deviceToken;
        return;
      } catch (err) {
        console.warn("[push] server token registration failed, falling back", err);
      }

      // --- Token rotation -------------------------------------------------
      // APNs/FCM reissue device tokens (reinstall, restore, key rotation).
      // Migrate this device's existing row onto the new token instead of
      // leaving a stale subscription that keeps failing on delivery.
      const previous = readLastToken();
      if (previous && previous !== deviceToken) {
        const { data: newRow } = await supabase
          .from("push_notifications")
          .select("id")
          .eq("endpoint", deviceToken)
          .maybeSingle();

        if (newRow?.id) {
          // New token already registered — retire the superseded row.
          await supabase
            .from("push_notifications")
            .delete()
            .eq("endpoint", previous)
            .eq("user_id", user.id);
        } else {
          // Rewrite the old row in place so history/ownership is preserved.
          await supabase
            .from("push_notifications")
            .update({
              endpoint: deviceToken,
              platform,
              device_id: deviceId,
              active: true,
              updated_at: new Date().toISOString(),
            })
            .eq("endpoint", previous)
            .eq("user_id", user.id);
        }
      }

      // Same device, token refreshed while this client was offline: drop any
      // other row this install owns so only the newest token stays active.
      await supabase
        .from("push_notifications")
        .delete()
        .eq("user_id", user.id)
        .eq("device_id", deviceId)
        .neq("endpoint", deviceToken);

      // No unique constraint on `endpoint` — do a manual find-or-update.
      const { data: existing } = await supabase
        .from("push_notifications")
        .select("id")
        .eq("endpoint", deviceToken)
        .maybeSingle();
      if (existing?.id) {
        await supabase
          .from("push_notifications")
          .update({
            user_id: user.id,
            platform,
            device_id: deviceId,
            active: true,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
      } else {
        await supabase.from("push_notifications").insert({
          user_id: user.id,
          endpoint: deviceToken,
          p256dh_key: "native",
          auth_key: "native",
          platform,
          device_id: deviceId,
          active: true,
        });
      }

      writeLastToken(deviceToken);
      persistedTokenRef.current = deviceToken;
    },
    [],
  );

  const deactivateToken = useCallback(async () => {
    const current = tokenRef.current;
    if (!current) return;
    await supabase
      .from("push_notifications")
      .update({ active: false })
      .eq("endpoint", current);
  }, []);

  /**
   * Attach the plugin listeners exactly once per app session.
   *
   * These are attached at boot on native — NOT gated on consent/permission —
   * because a tap that cold-starts the app fires `pushNotificationActionPerformed`
   * as soon as the WebView is alive. Waiting for the permission round-trip loses
   * the event and the user lands on the map instead of their JetCard.
   */
  const attachListeners = useCallback(async () => {
    if (listenersRef.current || !isNativeShell()) return;
    listenersRef.current = true;
    const PushNotifications = await loadPlugin();
    const platform = nativePlatform();

    await PushNotifications.addListener("registration", async (t) => {
      const refreshed = readLastToken() && readLastToken() !== t.value;
      tokenRef.current = t.value;
      setToken(t.value);
      setIsRegistered(true);
      if (refreshed) {
        console.info("[push] device token refreshed, rotating registration");
      }
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

    // Tap → route into the matching heatmap / JetCard state. Background and
    // cold-start taps go through here too; the target is queued so it survives
    // the launch even if the router hasn't mounted yet.
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
        if (!target) return;
        // Queue first (survives a not-yet-mounted router), then attempt an
        // immediate navigate for the warm/background case.
        queueDeepLink(target, data.notificationId ?? null);
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
   * Silent re-registration path. Runs on every app launch, on every resume,
   * and after each sign-in so APNs/FCM tokens reliably reach the database.
   *
   * Never prompts: it bails unless the OS permission is ALREADY granted. Once
   * granted, we follow the project's opt-out posture — registration proceeds
   * unless the user has an explicit `push_notifications: false` consent row.
   * (A missing row means "undecided", which used to silently block every
   * native device from ever registering a token.)
   */
  const initializePushNotifications = useCallback(async () => {
    if (!isNativeShell()) return;
    if (registeringRef.current) return;
    registeringRef.current = true;
    try {
      const PushNotifications = await loadPlugin();
      const perm = await PushNotifications.checkPermissions();
      setPermission(toPermission(perm.receive));
      if (perm.receive !== "granted") return;
      if ((await getExplicitConsent("push_notifications")) === false) return;
      await attachListeners();
      await PushNotifications.register();

      // The plugin only re-emits `registration` when the OS hands back a
      // token. On a warm resume, or when a different account signs in on the
      // same device, no event fires — re-persist the cached token so the row
      // is attached to the current user instead of silently going missing.
      const cached = tokenRef.current ?? readLastToken();
      if (cached) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user && persistedForRef.current !== user.id) {
          await persistToken(cached, nativePlatform());
        }
      }
    } catch (err) {
      console.error("[push] init failed", err);
    } finally {
      registeringRef.current = false;
    }
  }, [attachListeners, persistToken]);

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
    // Attach as early as possible so cold-start taps are captured.
    void attachListeners();

    const { data: sub } = supabase.auth.onAuthStateChange((evt, session) => {
      if (evt === "SIGNED_OUT") {
        void deactivateToken().finally(() => {
          tokenRef.current = null;
          persistedForRef.current = null;
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

    // --- Resume triggers -------------------------------------------------
    // A launch-only registration misses the common case of the shell being
    // suspended for days: the OS can rotate the token, or the user can grant
    // permission from system Settings, while the WebView stays alive. Re-run
    // the silent path whenever the app comes back to the foreground.
    const onForeground = () => {
      if (document.visibilityState !== "visible") return;
      void checkPermissions();
      void initializePushNotifications();
    };
    document.addEventListener("visibilitychange", onForeground);

    let removeResume: (() => void) | undefined;
    void (async () => {
      try {
        const { App } = await import("@capacitor/app");
        const handle = await App.addListener("resume", onForeground);
        removeResume = () => void handle.remove();
      } catch {
        /* @capacitor/app unavailable — visibilitychange still covers us. */
      }
    })();

    return () => {
      sub.subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onForeground);
      removeResume?.();
    };
  }, [
    attachListeners,
    checkPermissions,
    deactivateToken,
    initializePushNotifications,
  ]);

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
