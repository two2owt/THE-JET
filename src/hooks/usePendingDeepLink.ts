import { useEffect } from "react";
import { useNavigate, useSearchParams } from "@/lib/router-compat";
import { consumeDeepLink } from "@/lib/pendingDeepLink";
import { syncNotificationRead } from "@/lib/notificationRead";

/**
 * Flushes any deep link parked during a cold start (notification tapped while
 * the app was closed) as soon as the router is mounted, and again whenever the
 * app returns to the foreground with a queued target.
 */
export function usePendingDeepLink() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Web path: the service worker appends ?nid=<inbox row id> when a pushed
  // alert is tapped. Mark it read, then strip the param so a refresh or share
  // of the URL stays clean.
  useEffect(() => {
    const nid = searchParams.get("nid");
    if (!nid) return;
    void syncNotificationRead(nid);
    const next = new URLSearchParams(searchParams);
    next.delete("nid");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const flush = () => {
      const entry = consumeDeepLink();
      if (!entry) return;
      // Opening the JetCard from a tap counts as reading the alert.
      void syncNotificationRead(entry.notificationId);
      // Defer a tick so the route tree has finished its first commit.
      setTimeout(() => navigate(entry.target), 0);
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
