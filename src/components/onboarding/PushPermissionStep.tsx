import { useMemo, useState } from "react";
import { Bell, BellOff, CheckCircle2, PlusSquare, Share } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWebPushNotifications } from "@/hooks/useWebPushNotifications";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { setConsent } from "@/lib/consent";
import { setPushGrantLatch } from "@/lib/pushPermissionLatch";
import {
  trackPromptAccepted,
  trackPromptDenied,
  trackPromptSnoozed,
} from "@/lib/permissionPromptAnalytics";
import { openNotificationSettings } from "@/lib/openAppSettings";

/** iOS only delivers web push to apps installed to the Home Screen. */
const isIOS = () =>
  typeof navigator !== "undefined" &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" &&
      (navigator as unknown as { maxTouchPoints?: number }).maxTouchPoints !==
        undefined &&
      ((navigator as unknown as { maxTouchPoints: number }).maxTouchPoints ??
        0) > 1));

const isStandalone = () =>
  typeof window !== "undefined" &&
  (window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone ===
      true);

interface PushPermissionStepProps {
  /** Called once the user has made a choice (enabled or skipped). */
  onResolved?: (enabled: boolean) => void;
}

/**
 * Inline deal-alert opt-in shown during onboarding. It primes the user before
 * the OS/browser permission popup so a reflexive "Block" never strands them —
 * the same enable path Settings uses, so state stays in sync afterwards.
 */
export const PushPermissionStep = ({ onResolved }: PushPermissionStepProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [skipped, setSkipped] = useState(false);

  const {
    isSupported: isWebPushSupported,
    isSubscribed: isWebSubscribed,
    subscribe: webSubscribe,
    permission: webPermission,
  } = useWebPushNotifications();
  const {
    isNative,
    isRegistered: isNativeRegistered,
    permission: nativePermission,
    enable: enableNative,
  } = usePushNotifications();

  const needsInstallFirst = useMemo(
    () => !isNative && isIOS() && !isStandalone(),
    [isNative],
  );
  const blocked = isNative
    ? nativePermission === "denied"
    : webPermission === "denied";
  const enabled = isNative
    ? isNativeRegistered || nativePermission === "granted"
    : isWebSubscribed || webPermission === "granted";

  const surface = isNative ? "native_onboarding" : "web_onboarding";

  const handleEnable = async () => {
    setIsLoading(true);
    try {
      let success = false;
      if (isNative) {
        success = await enableNative();
      } else {
        // Consent must be recorded first: the runtime guard inside subscribe()
        // rejects the call when `push_notifications` isn't granted.
        await setConsent("push_notifications", true, "onboarding.push_enable");
        if (isWebPushSupported) {
          success = await webSubscribe();
        } else if ("Notification" in window) {
          success = (await Notification.requestPermission()) === "granted";
        }
      }

      if (success) {
        setPushGrantLatch();
        trackPromptAccepted("push", { surface });
      } else {
        trackPromptDenied("push", { surface });
      }
      onResolved?.(success);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSkip = () => {
    setSkipped(true);
    trackPromptSnoozed("push", { surface });
    onResolved?.(false);
  };

  return (
    <div className="rounded-2xl border-hairline bg-card/30 p-4 sm:p-5 backdrop-blur-sm space-y-3">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 border border-primary/25">
          {enabled ? (
            <CheckCircle2 className="h-5 w-5 text-primary" />
          ) : blocked ? (
            <BellOff className="h-5 w-5 text-muted-foreground" />
          ) : (
            <Bell className="h-5 w-5 text-primary" />
          )}
        </span>
        <div className="min-w-0">
          <p className="text-fluid-sm font-semibold text-foreground">
            {enabled
              ? "Deal alerts are on"
              : blocked
                ? "Alerts are blocked on this device"
                : "Get deal alerts"}
          </p>
          <p className="text-fluid-xs text-muted-foreground">
            {enabled
              ? "We'll ping you the moment a deal goes live near you. Manage this any time in Profile → Settings → Notifications."
              : blocked
                ? "Re-allow notifications for JET, then turn alerts on from Profile → Settings → Notifications."
                : needsInstallFirst
                  ? "On iPhone and iPad, alerts work once JET is added to your Home Screen."
                  : "Know the moment a deal drops near you. You can change this any time in Profile → Settings → Notifications."}
          </p>
        </div>
      </div>

      {!enabled && needsInstallFirst && !blocked && (
        <ol className="space-y-1.5 list-none text-fluid-xs text-foreground/80">
          <li className="flex items-center gap-2">
            <Share className="h-3.5 w-3.5 text-primary shrink-0" /> 1. Tap the
            Share button in Safari
          </li>
          <li className="flex items-center gap-2">
            <PlusSquare className="h-3.5 w-3.5 text-primary shrink-0" /> 2.
            Choose "Add to Home Screen"
          </li>
          <li className="flex items-center gap-2">
            <Bell className="h-3.5 w-3.5 text-primary shrink-0" /> 3. Reopen JET
            and enable alerts in Settings
          </li>
        </ol>
      )}

      {!enabled && !needsInstallFirst && (
        <div className="flex flex-wrap gap-2">
          {blocked ? (
            <Button
              size="sm"
              variant="outline"
              className="rounded-full"
              onClick={() => void openNotificationSettings()}
            >
              Open notification settings
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                variant="jet"
                className="rounded-full min-w-[140px]"
                onClick={handleEnable}
                disabled={isLoading}
              >
                {isLoading ? "Enabling…" : "Enable alerts"}
              </Button>
              {!skipped && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="rounded-full text-muted-foreground"
                  onClick={handleSkip}
                  disabled={isLoading}
                >
                  Not now
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default PushPermissionStep;
