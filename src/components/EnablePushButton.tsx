import { useState } from "react";
import { Bell, BellOff, BellRing, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useWebPushNotifications } from "@/hooks/useWebPushNotifications";
import { useAuth } from "@/contexts/AuthContext";
import { setConsent } from "@/lib/consent";

/**
 * Explicit, always-visible opt-in control for browser push notifications.
 *
 * Requests OS permission only on tap, then persists the resulting subscription
 * against the signed-in user via `claim_push_subscription`.
 */
export function EnablePushButton({ className }: { className?: string }) {
  const { session } = useAuth();
  const {
    isSupported,
    isSubscribed,
    isLoading,
    permission,
    subscribe,
    unsubscribe,
  } = useWebPushNotifications();
  const [working, setWorking] = useState(false);

  if (!isSupported) return null;

  const busy = working || isLoading;

  const handleEnable = async () => {
    if (!session?.user) {
      toast.error("Sign in to enable alerts", {
        description: "Push alerts are saved to your JET account.",
      });
      return;
    }
    if (permission === "denied") {
      toast.error("Notifications are blocked", {
        description:
          "Allow notifications for this site in your browser settings, then try again.",
      });
      return;
    }
    setWorking(true);
    try {
      // Record consent first — subscribe() refuses without it.
      await setConsent("push_notifications", true, "alerts_enable_button");
      await subscribe();
    } finally {
      setWorking(false);
    }
  };

  const handleDisable = async () => {
    setWorking(true);
    try {
      await unsubscribe();
      await setConsent("push_notifications", false, "alerts_enable_button");
    } finally {
      setWorking(false);
    }
  };

  if (isSubscribed) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={handleDisable}
        className={className}
        aria-label="Turn off browser push notifications"
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <BellRing className="h-4 w-4" />
        )}
        <span>Alerts on</span>
      </Button>
    );
  }

  return (
    <Button
      type="button"
      size="sm"
      disabled={busy}
      onClick={handleEnable}
      className={className}
      aria-label="Enable browser push notifications"
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : permission === "denied" ? (
        <BellOff className="h-4 w-4" />
      ) : (
        <Bell className="h-4 w-4" />
      )}
      <span>
        {permission === "denied" ? "Alerts blocked" : "Enable alerts"}
      </span>
    </Button>
  );
}
