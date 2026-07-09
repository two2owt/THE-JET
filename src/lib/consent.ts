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

const state: State = {
  foreground_location: false,
  background_tracking: false,
  push_notifications: false,
  messaging_analytics: false,
};

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
  (Object.keys(state) as ConsentType[]).forEach((k) => (state[k] = false));
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

export function hasConsent(type: ConsentType): boolean {
  // For OS/browser-permission-gated features, unauthenticated users have no
  // stored consent record — defer to the native permission prompt instead of
  // blocking. Once signed in, the persisted user_consents row takes over.
  if (!currentUserId && (type === "foreground_location" || type === "push_notifications")) {
    return true;
  }
  return state[type] === true;
}

export function isConsentLoaded(): boolean {
  return loaded;
}

const recentToasts = new Map<ConsentType, number>();

/**
 * Runtime guard. Returns true when consent is granted; otherwise toasts the
 * user (debounced) and returns false. Use at every entry point of a gated
 * feature so it cannot run when the toggle is off.
 */
export function requireConsent(type: ConsentType, opts?: { silent?: boolean }): boolean {
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
