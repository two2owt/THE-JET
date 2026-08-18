import { useEffect } from "react";
import { useNavigate } from "@/lib/router-compat";
import { consumeDeepLink } from "@/lib/pendingDeepLink";

/**
 * Flushes any deep link parked during a cold start (notification tapped while
 * the app was closed) as soon as the router is mounted, and again whenever the
 * app returns to the foreground with a queued target.
 */
export function usePendingDeepLink() {
  const navigate = useNavigate();

  useEffect(() => {
    const flush = () => {
      const target = consumeDeepLink();
      if (!target) return;
      // Defer a tick so the route tree has finished its first commit.
      setTimeout(() => navigate(target), 0);
    };

    flush();

    const onQueued = () => flush();
    const onVisible = () => {
      if (document.visibilityState === "visible") flush();
    };
    window.addEventListener("jet:deep-link-queued", onQueued);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("jet:deep-link-queued", onQueued);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [navigate]);
}
