import { useEffect, useRef } from "react";

/**
 * Auto-reload on update.
 *
 * Compares the build id baked into this bundle against the one served by
 * /api/public/version. When they differ, a new version has shipped and the
 * currently loaded bundle is stale, so we reload — silently for browser tabs
 * and installed (standalone/home-screen) PWA sessions alike.
 *
 * Reload happens only when it cannot interrupt the user: the tab is hidden, or
 * the tab just regained focus. No service worker and no update prompt.
 */
const POLL_INTERVAL_MS = 5 * 60 * 1000;
const MIN_CHECK_GAP_MS = 60 * 1000;

declare const __APP_BUILD_ID__: string;

function currentBuildId(): string {
  try {
    return typeof __APP_BUILD_ID__ === "string" ? __APP_BUILD_ID__ : "dev";
  } catch {
    return "dev";
  }
}

function isPreviewOrDev(): boolean {
  if (!import.meta.env.PROD) return true;
  if (typeof window === "undefined") return true;
  if (window.top !== window.self) return true;
  const host = window.location.hostname;
  return (
    host.startsWith("id-preview--") ||
    host.startsWith("preview--") ||
    host === "localhost" ||
    host.endsWith(".lovableproject.com") ||
    host.endsWith(".lovableproject-dev.com")
  );
}

export function useAutoReloadOnUpdate() {
  const lastCheckedRef = useRef(0);
  const reloadingRef = useRef(false);
  const pendingRef = useRef(false);

  useEffect(() => {
    if (isPreviewOrDev()) return;

    const localBuildId = currentBuildId();
    let cancelled = false;

    const reload = () => {
      if (reloadingRef.current) return;
      reloadingRef.current = true;
      window.location.reload();
    };

    const check = async () => {
      const now = Date.now();
      if (cancelled || reloadingRef.current) return;
      if (now - lastCheckedRef.current < MIN_CHECK_GAP_MS) return;
      lastCheckedRef.current = now;

      try {
        const res = await fetch("/api/public/version", {
          cache: "no-store",
          headers: { accept: "application/json" },
        });
        if (!res.ok) return;
        const data = (await res.json()) as { buildId?: string | null };
        const remote = data?.buildId;
        if (!remote || remote === localBuildId) return;

        // Stale bundle: reload now if the user isn't looking, otherwise on
        // the next time they leave/return to the tab.
        if (document.visibilityState === "hidden") reload();
        else pendingRef.current = true;
      } catch {
        // Offline or transient failure — try again on the next tick.
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        if (pendingRef.current) reload();
        return;
      }
      if (pendingRef.current) reload();
      else void check();
    };

    const onPreloadError = (event: Event) => {
      // A missing chunk means the deployment rotated under us.
      event.preventDefault();
      reload();
    };

    void check();
    const interval = window.setInterval(() => void check(), POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);
    window.addEventListener("pageshow", onVisibility);
    window.addEventListener("vite:preloadError", onPreloadError);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisibility);
      window.removeEventListener("pageshow", onVisibility);
      window.removeEventListener("vite:preloadError", onPreloadError);
    };
  }, []);
}
