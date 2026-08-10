/**
 * In-app (foreground) push delivery.
 *
 * When JET is open and visible, the push service worker skips the OS banner
 * and posts `{ type: "PUSH_RECEIVED", payload }` to the page instead. This
 * hook turns that into an in-app toast with a "View" action that deep links
 * into the exact deal / venue JetCard, and asks the notifications list to
 * refresh so the Alerts tab and badge stay in sync.
 */
import { useEffect } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { resolvePushDeepLink } from "@/lib/pushDeepLink";

export const NOTIFICATIONS_REFRESH_EVENT = "jet:notifications-refresh";

type PushPayload = {
  title?: string;
  body?: string;
  data?: Record<string, string | null | undefined>;
};

export const useForegroundPushMessages = () => {
  const navigate = useNavigate();

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    const onMessage = (event: MessageEvent) => {
      const msg = event.data as { type?: string; payload?: PushPayload } | undefined;
      if (!msg || msg.type !== "PUSH_RECEIVED") return;

      const payload = msg.payload ?? {};
      const data = (payload.data ?? {}) as Record<string, string>;
      const target = resolvePushDeepLink(data);

      toast(payload.title || "New JET alert", {
        description: payload.body || undefined,
        action: target
          ? { label: "View", onClick: () => navigate(target) }
          : undefined,
      });

      window.dispatchEvent(new CustomEvent(NOTIFICATIONS_REFRESH_EVENT));
    };

    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [navigate]);
};
