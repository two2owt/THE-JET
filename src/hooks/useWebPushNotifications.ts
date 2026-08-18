import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { requireConsent } from "@/lib/consent";

// VAPID public key for web push authentication.
// The key lives as a backend secret, so Vite cannot inline it at build time.
// Fall back to the edge function that serves the public half of the key pair.
const BUILD_TIME_VAPID_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || "";
let cachedVapidKey: string | null = BUILD_TIME_VAPID_KEY || null;

async function getVapidPublicKey(): Promise<string> {
  if (cachedVapidKey) return cachedVapidKey;
  try {
    const { data, error } = await supabase.functions.invoke("get-vapid-key");
    if (error) throw error;
    const key = (data as { publicKey?: string } | null)?.publicKey;
    if (key) {
      cachedVapidKey = key;
      return key;
    }
  } catch (err) {
    console.error("Failed to fetch VAPID public key:", err);
  }
  return "";
}

// Keep web-push SW isolated from the app SW to avoid scope conflicts.
const PUSH_SW_URL = "/sw-push.js";
const PUSH_SW_SCOPE = "/push/";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

const getPushRegistrationIfExists =
  async (): Promise<ServiceWorkerRegistration | null> => {
    if (!("serviceWorker" in navigator)) return null;

    // getRegistration expects a document URL; "/push/" works as a representative URL under that scope.
    const byUrl = await navigator.serviceWorker.getRegistration(PUSH_SW_SCOPE);
    if (byUrl) return byUrl;

    // Fallback: search all registrations.
    const regs = await navigator.serviceWorker.getRegistrations();
    return regs.find((r) => r.scope.endsWith(PUSH_SW_SCOPE)) ?? null;
  };

export const useWebPushNotifications = () => {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscription, setSubscription] = useState<PushSubscription | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [permission, setPermission] =
    useState<NotificationPermission>("default");

  const resync = useCallback(async () => {
    const currentPermission =
      "Notification" in window ? Notification.permission : "denied";
    setPermission(currentPermission);

    try {
      const registration = await getPushRegistrationIfExists();
      if (registration && currentPermission === "granted") {
        const existingSubscription = await (
          registration as any
        ).pushManager.getSubscription();
        setSubscription(existingSubscription);
        setIsSubscribed(!!existingSubscription);
      } else {
        setSubscription(null);
        setIsSubscribed(false);
      }
    } catch (error) {
      console.error("Error resyncing push state:", error);
    }
  }, []);

  useEffect(() => {
    const supported =
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    setIsSupported(supported);
    if (!supported) return;

    resync();

    let permissionStatus: PermissionStatus | null = null;
    const handlePermissionChange = () => resync();
    if ("permissions" in navigator) {
      try {
        navigator.permissions
          .query({ name: "notifications" as any })
          .then((status) => {
            permissionStatus = status;
            permissionStatus.addEventListener("change", handlePermissionChange);
          })
          .catch(() => {});
      } catch {
        // best-effort cleanup; ignore failures
      }
    }

    const handleVisibility = () => {
      if (!document.hidden) resync();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      permissionStatus?.removeEventListener("change", handlePermissionChange);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [resync]);

  const registerServiceWorker =
    async (): Promise<ServiceWorkerRegistration> => {
      if (!("serviceWorker" in navigator)) {
        throw new Error("Service workers not supported");
      }

      // Register the push service worker under an isolated scope to avoid replacing the app SW.
      const registration = await navigator.serviceWorker.register(PUSH_SW_URL, {
        scope: PUSH_SW_SCOPE,
      });

      // Best-effort update; do not block.
      registration.update().catch(() => undefined);

      return registration;
    };

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported) {
      toast.error("Push notifications not supported in this browser");
      return false;
    }

    // Runtime guard: do not request OS-level permission or create a
    // subscription unless the user has granted push notification consent.
    if (!requireConsent("push_notifications")) {
      return false;
    }

    const vapidPublicKey = await getVapidPublicKey();
    if (!vapidPublicKey) {
      console.error("VAPID public key not configured");
      toast.error("Push notification service not configured");
      return false;
    }

    setIsLoading(true);

    try {
      // Request notification permission
      const permissionResult = await Notification.requestPermission();
      setPermission(permissionResult);

      if (permissionResult !== "granted") {
        toast.error("Notification permission denied");
        setIsLoading(false);
        return false;
      }

      // Register service worker
      const registration = await registerServiceWorker();

      // Subscribe to push notifications using VAPID key
      const pushSubscription = await (
        registration as any
      ).pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          vapidPublicKey,
        ) as BufferSource,
      });

      setSubscription(pushSubscription);
      setIsSubscribed(true);

      // Do not report success until the endpoint is linked to this account.
      await saveSubscriptionToDatabase(pushSubscription);

      toast.success("Push notifications enabled!", {
        description: "You'll receive deal alerts in real-time",
      });

      setIsLoading(false);
      return true;
    } catch (error) {
      console.error("Error subscribing to push:", error);

      setSubscription(null);
      setIsSubscribed(false);
      toast.error("Alerts could not be linked to your account", {
        description: "Please try again after the app finishes updating.",
      });
      setIsLoading(false);
      return false;
    }
  }, [isSupported]);

  const saveSubscriptionToDatabase = async (
    pushSubscription: PushSubscription,
  ) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new Error("Sign in is required to save a push subscription");
    }

    const subscriptionJson = pushSubscription.toJSON();

    // Security-definer RPC: stores the device under the current user and
    // deactivates the same endpoint if it was registered to another account.
    const { error } = await supabase.rpc("claim_push_subscription", {
      _endpoint: subscriptionJson.endpoint || "",
      _p256dh: subscriptionJson.keys?.p256dh || "",
      _auth: subscriptionJson.keys?.auth || "",
      _platform: "web",
    });

    if (error) {
      console.error("Error saving subscription:", error);
      throw error;
    }
  };

  const unsubscribe = useCallback(async (): Promise<boolean> => {
    if (!subscription) return true;

    setIsLoading(true);

    try {
      await subscription.unsubscribe();

      // Mark subscription as inactive in database
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        await supabase
          .from("push_subscriptions")
          .update({ active: false })
          .eq("user_id", user.id)
          .eq("endpoint", subscription.endpoint);
      }

      setSubscription(null);
      setIsSubscribed(false);

      toast.success("Push notifications disabled");

      setIsLoading(false);
      return true;
    } catch (error) {
      console.error("Error unsubscribing:", error);
      toast.error("Failed to disable notifications");
      setIsLoading(false);
      return false;
    }
  }, [subscription]);

  const checkPermission = useCallback((): NotificationPermission => {
    if ("Notification" in window) {
      return Notification.permission;
    }
    return "denied";
  }, []);

  return {
    isSupported,
    isSubscribed,
    isLoading,
    permission,
    subscribe,
    unsubscribe,
    checkPermission,
    resync,
  };
};
