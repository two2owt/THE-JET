const KEY = "postAuthRedirect";

const isSafeTarget = (target: string): boolean => {
  if (!target || !target.startsWith("/")) return false;
  if (target.startsWith("//")) return false;
  if (target.startsWith("/auth")) return false;
  if (target.startsWith("/onboarding")) return false;
  if (target.startsWith("/verification-success")) return false;
  return true;
};

/**
 * Remember the route the user was trying to reach before being sent to /auth
 * or /onboarding, so we can return them there after they finish.
 * Defaults to the current location when no explicit path is provided.
 */
export const rememberPostAuthRedirect = (path?: string): void => {
  try {
    const target =
      path ?? `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (isSafeTarget(target)) {
      sessionStorage.setItem(KEY, target);
    }
  } catch {
    // sessionStorage may be unavailable (SSR, privacy mode) — ignore.
  }
};

/** Read and clear the remembered redirect, falling back to `fallback` (default "/"). */
export const consumePostAuthRedirect = (fallback: string = "/"): string => {
  try {
    const value = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return value && isSafeTarget(value) ? value : fallback;
  } catch {
    return fallback;
  }
};

/** Read the remembered redirect without clearing it. */
export const peekPostAuthRedirect = (): string | null => {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
};

/** Clear any remembered redirect. */
export const clearPostAuthRedirect = (): void => {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
};