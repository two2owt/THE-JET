import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logPushAudit } from "@/lib/push-audit";

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

async function deactivateLocalSubscription(
  userId: string,
  reason: string,
  action: "device_disabled" | "permission_revoked" = "device_disabled",
): Promise<void> {
  try {
    const registration =
      await navigator.serviceWorker.getRegistration(PUSH_SW_SCOPE);
    const sub = await registration?.pushManager.getSubscription();
    let endpoint = sub?.endpoint ?? null;
    if (!endpoint) {
      try {
        endpoint = localStorage.getItem("jet:web-push-endpoint");
      } catch {
        endpoint = null;
      }
    }
    if (endpoint) {
      await sub?.unsubscribe().catch(() => undefined);
      await supabase
        .from("push_notifications")
        .update({ active: false })
        .eq("user_id", userId)
        .eq("endpoint", endpoint);
      await logPushAudit(userId, action, reason, { endpoint, dedupe: true });
    } else {
      // This browser has no known endpoint. Never disable every web token for
      // the account: those rows may belong to other phones or browsers.
      await logPushAudit(userId, action, `${reason}.no_local_endpoint`, {
        dedupe: true,
      });
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

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  // Browser-level permission was revoked (OS/site settings) since last run:
  // reconcile the server rows so dispatch stops targeting a dead device.
  if (Notification.permission !== "granted") {
    await deactivateLocalSubscription(
      user.id,
      "reconcile.permission",
      "permission_revoked",
    );
    return;
  }

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
    await deactivateLocalSubscription(user.id, "reconcile.consent_revoked");
    return;
  }

  const { data: prefRow } = await supabase
    .from("user_preferences")
    .select("notifications_enabled")
    .eq("user_id", user.id)
    .maybeSingle();
  if (prefRow?.notifications_enabled === false) {
    await deactivateLocalSubscription(user.id, "reconcile.preference_off");
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
    const endpoint = json.endpoint || "";

    // Retire only this browser's previous endpoint when it rotates. Other web
    // rows belong to other devices and must remain active.
    let previousEndpoint: string | null = null;
    try {
      previousEndpoint = localStorage.getItem("jet:web-push-endpoint");
    } catch {
      previousEndpoint = null;
    }
    if (previousEndpoint && previousEndpoint !== endpoint) {
      await supabase
        .from("push_notifications")
        .update({ active: false })
        .eq("user_id", user.id)
        .eq("endpoint", previousEndpoint);
    }

    const { error } = await supabase.rpc("claim_push_subscription", {
      _endpoint: endpoint,
      _p256dh: json.keys?.p256dh || "",
      _auth: json.keys?.auth || "",
      _platform: "web",
    });
    if (error) console.warn("[push] subscription sync failed", error);
    if (!error) {
      await logPushAudit(user.id, "device_enabled", "reconcile.preference_on", {
        endpoint,
        dedupe: true,
      });
      try {
        localStorage.setItem("jet:web-push-endpoint", endpoint);
      } catch {
        /* ignore */
      }
    }
  } catch (err) {
    console.warn("[push] subscription sync error", err);
  }
}

/**
 * Throttled entry point used by launch/foreground reconciliation so rapid
 * tab switches don't spam the backend.
 */
let lastReconcileAt = 0;
let inFlight: Promise<void> | null = null;
const RECONCILE_INTERVAL_MS = 60_000;

export async function reconcilePushSubscription(force = false): Promise<void> {
  if (inFlight) return inFlight;
  const now = Date.now();
  if (!force && now - lastReconcileAt < RECONCILE_INTERVAL_MS) return;
  lastReconcileAt = now;
  inFlight = applyPushPreference().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

export function usePushSubscriptionSync() {
  useEffect(() => {
    // App launch.
    void reconcilePushSubscription(true);

    // Returning to the app (tab focus, PWA resume, native webview resume)
    // re-checks saved preference vs the live subscription without sign-out.
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void reconcilePushSubscription();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("pageshow", onVisible);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (
        event === "SIGNED_IN" ||
        event === "TOKEN_REFRESHED" ||
        event === "USER_UPDATED"
      ) {
        // Defer so the Supabase client finishes updating its session first.
        setTimeout(() => void reconcilePushSubscription(true), 0);
      }
    });

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("pageshow", onVisible);
      subscription.unsubscribe();
    };
  }, []);
}
