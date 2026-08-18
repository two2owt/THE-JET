import { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "@/lib/router-compat";
import { consumeDeepLink } from "@/lib/pendingDeepLink";
import { syncNotificationRead } from "@/lib/notificationRead";
import { claimAlert } from "@/lib/notificationIdempotency";

/**
 * Flushes any deep link parked during a cold start (notification tapped while
 * the app was closed) as soon as the router is mounted, and again whenever the
 * app returns to the foreground with a queued target.
 */
export function usePendingDeepLink() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const flushing = useRef(false);

  // Web path: the service worker appends ?nid=<inbox row id> when a pushed
  // alert is tapped. Mark it read, then strip the param so a refresh or share
  // of the URL stays clean.
  useEffect(() => {
    const nid = searchParams.get("nid");
    if (!nid) return;
    // Strip first so a re-render (or a reload of the same URL) can't re-enter;
    // syncNotificationRead is itself claim-guarded.
    const next = new URLSearchParams(searchParams);
    next.delete("nid");
    setSearchParams(next, { replace: true });
    void syncNotificationRead(nid);
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    let cancelled = false;
    const wait = (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms));

    /**
     * Drains every tap parked during the cold start, oldest first, so a batch
     * of alerts opens in the order they arrived and settles on the most recent
     * JetCard. Each hop gets a short settle window so the route can commit.
     */
    const flush = async () => {
      if (flushing.current) return;
      flushing.current = true;
      try {
        // Defer a tick so the route tree has finished its first commit.
        await wait(0);
        let opened = 0;
        for (;;) {
          if (cancelled) return;
          const entry = consumeDeepLink();
          if (!entry) return;
          // One navigation per alert id, ever — the SW URL and the queue can
          // both describe the same tap.
          if (!claimAlert("nav", entry.notificationId)) continue;
          // Opening the JetCard from a tap counts as reading the alert.
          void syncNotificationRead(entry.notificationId);
          if (opened > 0) await wait(700);
          if (cancelled) return;
          navigate(entry.target);
          opened += 1;
        }
      } finally {
        flushing.current = false;
      }
    };

    void flush();

    const onQueued = () => void flush();
    const onVisible = () => {
      if (document.visibilityState === "visible") void flush();
    };
    window.addEventListener("jet:deep-link-queued", onQueued);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.removeEventListener("jet:deep-link-queued", onQueued);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [navigate]);
}
