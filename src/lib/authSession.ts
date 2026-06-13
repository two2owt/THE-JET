import { supabase } from "@/integrations/supabase/client";
import { clearCachedOnboardingStatus } from "@/lib/onboardingStatus";

export const SESSION_BROADCAST_KEY = "jet-session-update";

const isAuthStorageKey = (key: string | null): key is string => {
  if (!key) return false;
  return (
    key.startsWith("sb-") ||
    key.includes("supabase.auth") ||
    key.includes("auth-token") ||
    key === "postAuthRedirect"
  );
};

const removeAuthKeys = (storage: Storage) => {
  const keysToRemove: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (isAuthStorageKey(key)) keysToRemove.push(key);
  }
  keysToRemove.forEach((key) => storage.removeItem(key));
};

export const clearPersistedAuthState = () => {
  try {
    removeAuthKeys(localStorage);
  } catch {
    // Storage can be unavailable in private browsing modes.
  }

  try {
    removeAuthKeys(sessionStorage);
  } catch {
    // Storage can be unavailable in private browsing modes.
  }
};

export const broadcastAuthStateChange = () => {
  try {
    localStorage.setItem(SESSION_BROADCAST_KEY, Date.now().toString());
  } catch {
    // Cross-tab broadcast is best-effort.
  }
};

export const discardCurrentAuthSession = () => {
  try {
    void supabase.auth.signOut({ scope: "local" }).catch((error) => {
      console.warn("Background sign out error:", error?.message ?? error);
    });
  } catch (error) {
    console.warn("Sign out failed to start:", error);
  }

  clearPersistedAuthState();
  clearCachedOnboardingStatus();
  broadcastAuthStateChange();
};

export const signOutCurrentUser = (redirectTo = "/auth") => {
  discardCurrentAuthSession();
  window.location.replace(redirectTo);
};