import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Drop-in `useState` replacement that persists a page's view state
 * (search text, sort, filter chips) for the lifetime of the browser tab.
 *
 * Used so navigating away from /deals, /alerts or /favorites and coming back
 * restores the exact results view the user left behind, without polluting the
 * URL or leaking state across sessions/devices.
 *
 * - sessionStorage (per tab, cleared when the tab closes)
 * - SSR-safe: falls back to `initial` on the server, hydrates on mount
 */
export function usePersistentViewState<T>(
  key: string,
  initial: T,
): [T, (value: T | ((prev: T) => T)) => void] {
  const storageKey = `jet:view:${key}`;
  const [value, setValue] = useState<T>(initial);
  const hydrated = useRef(false);

  // Hydrate after mount so server and first client render match.
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw !== null) setValue(JSON.parse(raw) as T);
    } catch {
      /* corrupt or unavailable storage — keep the default */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated.current) return;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      /* quota or private mode — persistence is best-effort */
    }
  }, [storageKey, value]);

  const set = useCallback((next: T | ((prev: T) => T)) => {
    setValue(next);
  }, []);

  return [value, set];
}

export default usePersistentViewState;
