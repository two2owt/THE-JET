import { useEffect, useState } from "react";

/**
 * Reports connectivity. Optimistic by design: we assume online until the
 * browser fires an `offline` event AND a lightweight probe confirms it.
 * This prevents a false "You're offline" flash during SSR/hydration or when
 * `navigator.onLine` is momentarily false while the page is still loading.
 */
const probeNetwork = async (): Promise<boolean> => {
  if (typeof fetch === "undefined") return true;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    await fetch(`/favicon.ico?probe=${Date.now()}`, {
      method: "HEAD",
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timer);
    return true;
  } catch {
    return false;
  }
};

export const useOnlineStatus = () => {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const confirmOffline = async () => {
      // Trust an explicit offline signal only after a failed probe.
      const reachable = await probeNetwork();
      if (!cancelled) setIsOnline(reachable);
    };

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => {
      void confirmOffline();
    };

    // Only re-check on mount if the browser is already reporting offline.
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      void confirmOffline();
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      cancelled = true;
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return isOnline;
};
