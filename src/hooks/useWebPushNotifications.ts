import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// VAPID public key for web push authentication
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';

// Keep web-push SW isolated from the app SW to avoid scope conflicts.
const PUSH_SW_URL = '/sw-push.js';
const PUSH_SW_SCOPE = '/push/';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

const getPushRegistrationIfExists = async (): Promise<ServiceWorkerRegistration | null> => {
  if (!('serviceWorker' in navigator)) return null;

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
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');

  useEffect(() => {
    // Check if push notifications are supported
    const supported = 'serviceWorker' in navigator &&
                      'PushManager' in window &&
                      'Notification' in window;
    setIsSupported(supported);

    if (supported) {
      setPermission(Notification.permission);
      checkExistingSubscription();
    }
  }, []);

  const checkExistingSubscription = async () => {
    try {
      const registration = await getPushRegistrationIfExists();
      if (!registration) return;

      const existingSubscription = await (registration as any).pushManager.getSubscription();

      if (existingSubscription) {
        setSubscription(existingSubscription);
        setIsSubscribed(true);
      }
    } catch (error) {
      console.error('Error checking subscription:', error);
    }
  };

  const registerServiceWorker = async (): Promise<ServiceWorkerRegistration> => {
    if (!('serviceWorker' in navigator)) {
      throw new Error('Service workers not supported');
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

    if (!VAPID_PUBLIC_KEY) {
      console.error("VAPID public key not configured");
      toast.error("Push notification service not configured");
      return false;
    }

    setIsLoading(true);

    try {
      // Request notification permission
      const permissionResult = await Notification.requestPermission();
      setPermission(permissionResult);

      if (permissionResult !== 'granted') {
        toast.error("Notification permission denied");
        setIsLoading(false);
        return false;
      }

      // Register service worker
      const registration = await registerServiceWorker();

      // Subscribe to push notifications using VAPID key
      const pushSubscription = await (registration as any).pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource
      });

      setSubscription(pushSubscription);
      setIsSubscribed(true);

      // Save subscription to database
      await saveSubscriptionToDatabase(pushSubscription);

      toast.success("Push notifications enabled!", {
        description: "You'll receive deal alerts in real-time"
      });

      setIsLoading(false);
      return true;
    } catch (error) {
      console.error('Error subscribing to push:', error);
      
      // Fallback: just enable notifications without full push subscription
      if (Notification.permission === 'granted') {
        toast.success("Notifications enabled", {
          description: "You'll receive alerts when deals are available"
        });
        setIsLoading(false);
        return true;
      }
      
      toast.error("Failed to enable notifications");
      setIsLoading(false);
      return false;
    }
  }, [isSupported]);

  const saveSubscriptionToDatabase = async (pushSubscription: PushSubscription) => {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      console.warn('No user logged in, subscription not saved');
      return;
    }

    const subscriptionJson = pushSubscription.toJSON();
    
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert({
        user_id: user.id,
        endpoint: subscriptionJson.endpoint || '',
        p256dh_key: subscriptionJson.keys?.p256dh || '',
        auth_key: subscriptionJson.keys?.auth || '',
        active: true,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,endpoint'
      });

    if (error) {
      console.error('Error saving subscription:', error);
    } else {
      console.log('Push subscription saved successfully');
    }
  };

  const unsubscribe = useCallback(async (): Promise<boolean> => {
    if (!subscription) return true;

    setIsLoading(true);

    try {
      await subscription.unsubscribe();

      // Mark subscription as inactive in database
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        await supabase
          .from('push_subscriptions')
          .update({ active: false })
          .eq('user_id', user.id)
          .eq('endpoint', subscription.endpoint);
      }

      setSubscription(null);
      setIsSubscribed(false);

      toast.success("Push notifications disabled");
      
      setIsLoading(false);
      return true;
    } catch (error) {
      console.error('Error unsubscribing:', error);
      toast.error("Failed to disable notifications");
      setIsLoading(false);
      return false;
    }
  }, [subscription]);

  const checkPermission = useCallback((): NotificationPermission => {
    if ('Notification' in window) {
      return Notification.permission;
    }
    return 'denied';
  }, []);

  return {
    isSupported,
    isSubscribed,
    isLoading,
    permission,
    subscribe,
    unsubscribe,
    checkPermission
  };
};
