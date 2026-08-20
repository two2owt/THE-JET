import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Keeps the browser's web-push subscription linked to the *currently signed-in*
 * user.
 *
 * Without this, a device only lands in `push_notifications` at the exact moment
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

async function deactivateLocalSubscription(userId: string): Promise<void> {
  try {
    const registration =
      await navigator.serviceWorker.getRegistration(PUSH_SW_SCOPE);
    const sub = await registration?.pushManager.getSubscription();
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe().catch(() => undefined);
      await supabase
        .from("push_notifications")
        .update({ active: false })
        .eq("user_id", userId)
        .eq("endpoint", endpoint);
    } else {
      // No live browser subscription, but stale rows may still be active.
      await supabase
        .from("push_notifications")
        .update({ active: false })
        .eq("user_id", userId)
        .eq("platform", "web");
    }
    try {
      localStorage.removeItem("jet:web-push-endpoint");
    } catch {
      /* ignore */
    }
  } catch (err) {
    console.warn("[push] failed to deactivate subscription", err);
  }
}

/**
 * Reads the account's *latest* push preference and makes this device match it.
 *
 * Called on mount, on every sign-in, and right after the user flips the
 * toggle in Settings. Users are opted in by default and stay enabled until
 * they sign back in with a preference that says otherwise — at which point
 * this deactivates the device subscription instead of silently keeping it.
 */
export async function applyPushPreference(): Promise<void> {
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

  // Opt-out model: every signed-up user is a push recipient unless they
  // explicitly turned it off. A revoked `push_notifications` consent row or a
  // disabled master switch in `user_preferences` must never be silently
  // re-subscribed here; the absence of a row is treated as "not opted out".
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
  if (hasConsentRecord && !consentGranted) {
    await deactivateLocalSubscription(user.id);
    return;
  }

  const { data: prefRow } = await supabase
    .from("user_preferences")
    .select("notifications_enabled")
    .eq("user_id", user.id)
    .maybeSingle();
  if (prefRow?.notifications_enabled === false) {
    await deactivateLocalSubscription(user.id);
    return;
  }

  try {
    const registration =
      (await navigator.serviceWorker.getRegistration(PUSH_SW_SCOPE)) ??
      (await navigator.serviceWorker.register(PUSH_SW_URL, {
        scope: PUSH_SW_SCOPE,
      }));

    await navigator.serviceWorker.ready.catch(() => undefined);

    let sub = await registration.pushManager.getSubscription();
    if (!sub) {
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
    void applyPushPreference();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (
        event === "SIGNED_IN" ||
        event === "TOKEN_REFRESHED" ||
        event === "USER_UPDATED"
      ) {
        // Defer so the Supabase client finishes updating its session first.
        setTimeout(() => void applyPushPreference(), 0);
      }
    });

    return () => subscription.unsubscribe();
  }, []);
}
