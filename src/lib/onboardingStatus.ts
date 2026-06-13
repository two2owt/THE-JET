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

export const writeCachedOnboardingStatus = (userId: string, completed: boolean): void => {
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