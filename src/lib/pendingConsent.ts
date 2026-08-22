import { supabase } from "@/integrations/supabase/client";

const KEY = "jet_pending_signup_consent";

export interface PendingSignupConsent {
  email: string;
  dataProcessingConsent: boolean;
  locationConsent: boolean;
  capturedAt: string;
}

/**
 * With email confirmation enabled, `supabase.auth.signUp()` returns no session.
 * Any `profiles` / `user_consents` write made right after signup therefore runs
 * as `anon` and is silently rejected by RLS — the consent the user just gave is
 * lost. We stash it locally and flush it on the first authenticated session.
 */
export const rememberPendingConsent = (consent: PendingSignupConsent): void => {
  try {
    localStorage.setItem(KEY, JSON.stringify(consent));
  } catch {
    // storage may be unavailable
  }
};

const readPendingConsent = (): PendingSignupConsent | null => {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PendingSignupConsent) : null;
  } catch {
    return null;
  }
};

export const clearPendingConsent = (): void => {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
};

/** Writes the signup consent for `userId`. Safe to call repeatedly. */
export const persistSignupConsent = async (
  userId: string,
  consent: Pick<
    PendingSignupConsent,
    "dataProcessingConsent" | "locationConsent"
  >,
): Promise<void> => {
  const now = new Date().toISOString();

  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      data_processing_consent: consent.dataProcessingConsent,
      data_processing_consent_date: now,
      location_consent_given: consent.locationConsent,
      location_consent_date: consent.locationConsent ? now : null,
    })
    .eq("id", userId);
  if (profileError) throw profileError;

  // Foreground location is opt-out (granted at signup so nearby deals work
  // immediately); background tracking follows the signup checkbox.
  // `user_consents` is an append-only log (latest row per type wins).
  const { error: consentError } = await supabase.from("user_consents").insert([
      {
        user_id: userId,
        consent_type: "foreground_location" as const,
        granted: true,
        policy_version: "2025-06",
        source: "auth.signup",
        granted_at: now,
        revoked_at: null,
      },
      {
        user_id: userId,
        consent_type: "background_tracking" as const,
        granted: consent.locationConsent,
        policy_version: "2025-06",
        source: "auth.signup",
        granted_at: consent.locationConsent ? now : null,
        revoked_at: consent.locationConsent ? null : now,
      },
  ]);
  if (consentError) throw consentError;
};

/**
 * Flush any consent captured during signup once the user has a real session.
 * No-op when nothing is pending. Best-effort: keeps the stash on failure so a
 * later session can retry.
 */
export const flushPendingConsent = async (
  userId: string,
  email?: string | null,
): Promise<void> => {
  const pending = readPendingConsent();
  if (!pending) return;
  // Never apply one person's signup consent to a different account.
  if (email && pending.email && pending.email !== email.toLowerCase()) return;
  try {
    await persistSignupConsent(userId, pending);
    clearPendingConsent();
  } catch {
    // keep the stash for the next authenticated session
  }
};
