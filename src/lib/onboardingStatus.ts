const KEY_PREFIX = "jet-onboarding-completed:";

/** Cache the onboarding-completed flag per user so route guards on
 *  `/`, `/onboarding`, etc. don't re-query the profiles table on every
 *  mount. Eliminates the spinner-flash and redirect-bounce between
 *  `/onboarding` ⇄ `/` for users who have already finished onboarding.
 */
export const readCachedOnboardingStatus = (userId: string): boolean | null => {
  try {
    const raw = sessionStorage.getItem(KEY_PREFIX + userId);
    if (raw === "1") return true;
    if (raw === "0") return false;
    return null;
  } catch {
    return null;
  }
};

export const writeCachedOnboardingStatus = (
  userId: string,
  completed: boolean,
): void => {
  try {
    sessionStorage.setItem(KEY_PREFIX + userId, completed ? "1" : "0");
  } catch {
    // sessionStorage may be unavailable
  }
};

export const clearCachedOnboardingStatus = (userId?: string): void => {
  try {
    if (userId) {
      sessionStorage.removeItem(KEY_PREFIX + userId);
      return;
    }
    // Clear all entries when no user id given (e.g. on sign-out).
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(KEY_PREFIX)) keys.push(k);
    }
    keys.forEach((k) => sessionStorage.removeItem(k));
  } catch {
    // ignore
  }
};

const SNOOZE_PREFIX = "jet-onboarding-snoozed:";
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

/** "Skip for later": remember that the user chose to postpone onboarding so
 *  sign-in redirects send them to the app instead of back to /onboarding. */
export const snoozeOnboarding = (userId: string): void => {
  try {
    localStorage.setItem(SNOOZE_PREFIX + userId, String(Date.now() + SNOOZE_MS));
  } catch {
    // localStorage may be unavailable
  }
};

export const isOnboardingSnoozed = (userId: string): boolean => {
  try {
    const raw = localStorage.getItem(SNOOZE_PREFIX + userId);
    if (!raw) return false;
    const until = Number(raw);
    if (!Number.isFinite(until) || Date.now() > until) {
      localStorage.removeItem(SNOOZE_PREFIX + userId);
      return false;
    }
    return true;
  } catch {
    return false;
  }
};

export const clearOnboardingSnooze = (userId: string): void => {
  try {
    localStorage.removeItem(SNOOZE_PREFIX + userId);
  } catch {
    // ignore
  }
};
