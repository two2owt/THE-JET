/**
 * One-time stale cache purge.
 *
 * Returning users (browser tabs and installed home-screen sessions alike) can
 * be pinned to an old app-shell service worker or Cache Storage bucket left
 * behind by the previous Workbox PWA setup. This runs once per build: it
 * unregisters legacy app service workers, deletes their caches, and reloads
 * so the newest JET build is served.
 *
 * The push messaging worker (/sw-push.js) and its caches are never touched.
 */

const PURGE_KEY = "jet_cache_purge_build";
const PUSH_SW_FILE = "sw-push.js";

declare const __APP_BUILD_ID__: string;

function buildId(): string {
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

/** Cache Storage is origin-scoped — only drop app-shell buckets, never push. */
function isAppShellCache(name: string): boolean {
  if (name.includes("push")) return false;
  return /(^|-)precache-v\d+-|(^|-)workbox|(^|-)runtime-|(^|-)jet-(app|shell|assets)/i.test(
    name,
  );
}

export async function purgeStaleCaches(): Promise<void> {
  if (isPreviewOrDev()) return;

  const current = buildId();
  let last: string | null = null;
  try {
    last = localStorage.getItem(PURGE_KEY);
  } catch {
    return; // storage blocked — skip rather than reload-loop
  }
  if (last === current) return;

  let removedSomething = false;

  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.allSettled(
        regs.map(async (reg) => {
          const url =
            reg.active?.scriptURL ??
            reg.waiting?.scriptURL ??
            reg.installing?.scriptURL ??
            "";
          if (url.includes(PUSH_SW_FILE)) return;
          if (!url) return;
          const ok = await reg.unregister();
          if (ok) removedSomething = true;
        }),
      );
    }

    if ("caches" in window) {
      const names = await caches.keys();
      const stale = names.filter(isAppShellCache);
      await Promise.allSettled(stale.map((name) => caches.delete(name)));
      if (stale.length > 0) removedSomething = true;
    }
  } catch {
    // best-effort
  }

  try {
    localStorage.setItem(PURGE_KEY, current);
  } catch {
    return;
  }

  // Only reload when something stale was actually evicted, and only when the
  // user isn't mid-interaction.
  if (removedSomething && document.visibilityState === "visible") {
    window.location.reload();
  }
}
