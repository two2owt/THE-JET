import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Keeps the browser's web-push subscription linked to the *currently signed-in*
 * user.
 *
 * Without this, a device only lands in `push_subscriptions` at the exact moment
 * the user taps "Enable" while signed in. Anyone who granted permission before
 * signing in, signed in on a second account, cleared their row, or had the
 * browser rotate the endpoint would silently stop receiving pushes.
 *
 * Runs on mount and on every auth state change. It never prompts: it only acts
 * when notification permission is already granted.
 */
const PUSH_SW_URL = "/sw-push.js";
const PUSH_SW_SCOPE = "/push/";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

let vapidKey: string | null = import.meta.env.VITE_VAPID_PUBLIC_KEY || null;

async function getVapidPublicKey(): Promise<string> {
  if (vapidKey) return vapidKey;
  try {
    const { data, error } = await supabase.functions.invoke("get-vapid-key");
    if (error) throw error;
    const key = (data as { publicKey?: string } | null)?.publicKey ?? "";
    if (key) vapidKey = key;
    return key;
  } catch {
    return "";
  }
}

async function syncSubscription(): Promise<void> {
  if (typeof window === "undefined") return;
  if (
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  )
    return;
  if (Notification.permission !== "granted") return;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  // Respect the user's own opt-out. Browser permission staying "granted" is
  // not consent: the Settings toggle / Enable button writes a
  // `push_notifications` consent row, and a revoked one must never be
  // silently re-subscribed here.
  const { data: consentRows, error: consentError } = await supabase
    .from("user_consents")
    .select("granted")
    .eq("user_id", user.id)
    .eq("consent_type", "push_notifications")
    .order("created_at", { ascending: false })
    .limit(1);
  if (consentError) return;
  const consentGranted = consentRows?.[0]?.granted === true;
  const hasConsentRecord = (consentRows?.length ?? 0) > 0;
  if (hasConsentRecord && !consentGranted) return;

  try {
    const registration =
      (await navigator.serviceWorker.getRegistration(PUSH_SW_SCOPE)) ??
      (await navigator.serviceWorker.register(PUSH_SW_URL, {
        scope: PUSH_SW_SCOPE,
      }));

    await navigator.serviceWorker.ready.catch(() => undefined);

    let sub = await registration.pushManager.getSubscription();
    if (!sub) {
      // Only mint a brand-new subscription when the user explicitly opted in.
      // Legacy devices with an existing subscription are still re-linked below.
      if (!consentGranted) return;
      const key = await getVapidPublicKey();
      if (!key) return;
      sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
      });
    }

    const json = sub.toJSON();
    const { error } = await supabase.rpc("claim_push_subscription", {
      _endpoint: json.endpoint || "",
      _p256dh: json.keys?.p256dh || "",
      _auth: json.keys?.auth || "",
      _platform: "web",
    });
    if (error) console.warn("[push] subscription sync failed", error);
  } catch (err) {
    console.warn("[push] subscription sync error", err);
  }
}

export function usePushSubscriptionSync() {
  useEffect(() => {
    void syncSubscription();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (
        event === "SIGNED_IN" ||
        event === "TOKEN_REFRESHED" ||
        event === "USER_UPDATED"
      ) {
        // Defer so the Supabase client finishes updating its session first.
        setTimeout(() => void syncSubscription(), 0);
      }
    });

    return () => subscription.unsubscribe();
  }, []);
}
