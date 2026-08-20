import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type ConsentType =
  | "foreground_location"
  | "background_tracking"
  | "push_notifications"
  | "messaging_analytics";

const LABELS: Record<ConsentType, string> = {
  foreground_location: "Foreground location",
  background_tracking: "Background tracking",
  push_notifications: "Push notifications",
  messaging_analytics: "Messaging analytics",
};

type State = Record<ConsentType, boolean>;

/**
 * Default consent posture.
 *
 * `foreground_location` is opt-out: it is ON for everyone (signed out, newly
 * signed up, and signed in) so the Explore / Hot tab can rank deals by
 * distance immediately. It only turns off when the user explicitly disables
 * Location Tracking in Settings, which writes a `granted: false` row.
 * Push notifications also use an account-level opt-out posture. Browser and
 * device permission is still requested only from a user gesture.
 */
const DEFAULTS: State = {
  foreground_location: true,
  background_tracking: false,
  push_notifications: true,
  messaging_analytics: false,
};

const state: State = { ...DEFAULTS };

let currentUserId: string | null = null;
let loaded = false;
const listeners = new Set<(s: State) => void>();

function emit() {
  for (const l of listeners) l({ ...state });
}

export function subscribeConsent(l: (s: State) => void): () => void {
  listeners.add(l);
  l({ ...state });
  return () => listeners.delete(l);
}

export async function loadConsents(userId: string | null): Promise<void> {
  currentUserId = userId;
  (Object.keys(state) as ConsentType[]).forEach(
    (k) => (state[k] = DEFAULTS[k]),
  );
  if (!userId) {
    loaded = true;
    emit();
    return;
  }
  const { data, error } = await supabase
    .from("user_consents")
    .select("consent_type, granted, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("[consent] load failed", error);
    loaded = true;
    emit();
    return;
  }
  const seen = new Set<string>();
  for (const row of data ?? []) {
    const t = row.consent_type as ConsentType;
    if (seen.has(t)) continue;
    seen.add(t);
    state[t] = !!row.granted;
  }
  loaded = true;
  emit();
}

export function refreshConsents(): Promise<void> {
  return loadConsents(currentUserId);
}

/**
 * Explicitly record a consent decision for the signed-in user and refresh the
 * in-memory state so `requireConsent` immediately reflects it. Used by the
 * push opt-in prompt and the Settings toggles.
 */
export async function setConsent(
  type: ConsentType,
  granted: boolean,
  source: string,
): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const nowIso = new Date().toISOString();
  const { error } = await supabase.from("user_consents").insert({
    user_id: user.id,
    consent_type: type,
    granted,
    policy_version: "2025-06",
    source,
    granted_at: granted ? nowIso : null,
    revoked_at: granted ? null : nowIso,
  });
  if (error) {
    console.error("[consent] failed to record", type, error);
    return false;
  }
  state[type] = granted;
  emit();
  await loadConsents(user.id);
  return true;
}

export function hasConsent(type: ConsentType): boolean {
  return state[type] === true;
}

export function isConsentLoaded(): boolean {
  return loaded;
}

/**
 * Read the user's *explicit* decision for a consent type straight from the
 * database: `true` / `false` when a row exists, `null` when the user has never
 * decided. Callers that treat "never decided" differently from "declined"
 * (e.g. native push, which follows the OS permission when undecided) need this
 * distinction — `hasConsent` collapses both into `false`.
 */
export async function getExplicitConsent(
  type: ConsentType,
): Promise<boolean | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("user_consents")
    .select("granted")
    .eq("user_id", user.id)
    .eq("consent_type", type)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return data ? !!data.granted : null;
}

const recentToasts = new Map<ConsentType, number>();

/**
 * Runtime guard. Returns true when consent is granted; otherwise toasts the
 * user (debounced) and returns false. Use at every entry point of a gated
 * feature so it cannot run when the toggle is off.
 */
export function requireConsent(
  type: ConsentType,
  opts?: { silent?: boolean },
): boolean {
  if (hasConsent(type)) return true;
  if (!opts?.silent) {
    const now = Date.now();
    const last = recentToasts.get(type) ?? 0;
    if (now - last > 4000) {
      recentToasts.set(type, now);
      toast.error(`${LABELS[type]} is disabled`, {
        description: "Enable it in Settings to use this feature.",
      });
    }
  }
  return false;
}
