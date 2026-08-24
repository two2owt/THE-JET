import { useState, useEffect, useMemo } from "react";
import {
  Bell,
  Zap,
  MapPin,
  Gift,
  Share,
  PlusSquare,
  Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useWebPushNotifications } from "@/hooks/useWebPushNotifications";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { setConsent } from "@/lib/consent";
import {
  hasPushGrantLatch,
  setPushGrantLatch,
  syncPushGrantLatch,
} from "@/lib/pushPermissionLatch";
import { supabase } from "@/integrations/supabase/client";
import { usePromptSlot, PROMPT_PRIORITY } from "@/hooks/usePromptSlot";
import {
  trackPromptAccepted,
  trackPromptDenied,
  trackPromptImpression,
  trackPromptSnoozed,
} from "@/lib/permissionPromptAnalytics";
import {
  canOpenOsNotificationSettings,
  openNotificationSettings,
} from "@/lib/openAppSettings";

interface PushNotificationPromptProps {
  show: boolean;
  onDismiss: () => void;
}

const DISMISS_KEY = "push-notification-prompt-dismissed";
const DISMISS_DURATION = 14 * 24 * 60 * 60 * 1000; // 14 days

/** iOS only delivers web push to apps installed to the Home Screen. */
const isIOS = () =>
  typeof navigator !== "undefined" &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" &&
      (navigator as any).maxTouchPoints > 1));

const isStandalone = () =>
  typeof window !== "undefined" &&
  (window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true);

export const PushNotificationPrompt = ({
  show,
  onDismiss,
}: PushNotificationPromptProps) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const hasSlot = usePromptSlot("push", PROMPT_PRIORITY.push, isVisible);

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

  // Subscriptions are stored per user, so only prompt signed-in visitors.
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setSignedIn(!!data.user);
    });
    return () => {
      cancelled = true;
    };
  }, [show]);

  // iOS Safari can't subscribe until the app is installed to the Home Screen.
  // Inside the native shell this never applies — the OS handles delivery.
  const needsInstallFirst = useMemo(
    () => !isNative && isIOS() && !isStandalone(),
    [isNative],
  );
  const isBlocked = isNative
    ? nativePermission === "denied"
    : webPermission === "denied";
  const permissionGranted = isNative
    ? nativePermission === "granted"
    : webPermission === "granted";
  const alreadyOn =
    permissionGranted || (isNative ? isNativeRegistered : isWebSubscribed);

  // Remember the grant so a later session never re-asks, even before the
  // permission state has resolved on that load. If the user revokes the
  // permission at browser/OS level the latch is dropped so priming can return.
  useEffect(() => {
    if (typeof window === "undefined") return;
    syncPushGrantLatch(isNative ? nativePermission : webPermission);
  }, [isNative, nativePermission, webPermission]);

  useEffect(() => {
    if (!show || alreadyOn || !signedIn) return;
    // Already allowed on this device at some point — never nag again.
    if (hasPushGrantLatch()) return;
    // OS/browser-level block: nothing we can do in-app, so don't nag on load.
    if (isBlocked) return;

    const dismissedAt = localStorage.getItem(DISMISS_KEY);
    if (dismissedAt) {
      const dismissTime = parseInt(dismissedAt, 10);
      if (Date.now() - dismissTime < DISMISS_DURATION) return;
      localStorage.removeItem(DISMISS_KEY);
    }

    const timer = setTimeout(() => {
      setIsVisible(true);
      trackPromptImpression("push", {
        surface: isNative ? "native_prompt" : "web_prompt",
      });
    }, 1500);
    return () => clearTimeout(timer);
  }, [show, alreadyOn, signedIn, isBlocked, isNative]);

  const handleEnable = async () => {
    setIsLoading(true);
    let success = false;

    if (isNative) {
      // enable() prompts the OS and records consent once granted.
      success = await enableNative();
      setIsLoading(false);
      if (success) trackPromptAccepted("push", { surface: "native_prompt" });
      else trackPromptDenied("push", { surface: "native_prompt" });
      if (success) {
        setPushGrantLatch();
        setIsVisible(false);
        onDismiss();
      }
      return;
    }

    // Record the opt-in before subscribing — the runtime consent guard inside
    // subscribe() rejects the call when `push_notifications` isn't granted,
    // which previously made this button a no-op.
    await setConsent("push_notifications", true, "prompt.push_enable");

    if (isWebPushSupported) {
      // subscribe() internally calls Notification.requestPermission()
      // only triggered here after the user taps Enable.
      success = await webSubscribe();
    } else if ("Notification" in window) {
      const permission = await Notification.requestPermission();
      success = permission === "granted";
    }

    setIsLoading(false);
    if (success) trackPromptAccepted("push", { surface: "web_prompt" });
    else trackPromptDenied("push", { surface: "web_prompt" });
    if (success) {
      setPushGrantLatch();
      setIsVisible(false);
      onDismiss();
    }
  };

  const handleDismiss = () => {
    if (isVisible) {
      trackPromptSnoozed("push", {
        surface: isNative ? "native_prompt" : "web_prompt",
      });
    }
    setIsVisible(false);
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
    onDismiss();
  };

  return (
    <Dialog
      open={isVisible && hasSlot}
      onOpenChange={(open) => {
        if (!open && !isLoading) handleDismiss();
      }}
    >
      <DialogContent className="max-w-md p-0 overflow-hidden border-border/50 bg-background/95 backdrop-blur-xl">
        <div className="p-6">
          <DialogHeader className="space-y-3 text-left">
            <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20">
              <Bell className="h-7 w-7 text-primary" />
            </div>
            <DialogTitle className="text-lg font-semibold">
              Turn on deal alerts
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {isBlocked
                ? isNative
                  ? "Notifications are turned off for JET on this device. Allow them in Settings > Notifications > JET, then come back and tap Enable."
                  : "Notifications are currently blocked for JET in this browser. Re-allow them, then come back and tap Enable."
                : needsInstallFirst
                  ? "On iPhone and iPad, alerts work once JET is added to your Home Screen. Follow the two steps below, reopen JET from your Home Screen, then tap Enable."
                  : "Get instant alerts the moment a Charlotte deal goes live near you. Tap Enable, then choose Allow in the browser popup that appears."}
            </DialogDescription>
          </DialogHeader>

          {isBlocked ? (
            isNative ? (
              <ol className="space-y-2 my-5 text-sm text-foreground/80 list-decimal pl-5">
                <li>Open your device Settings app.</li>
                <li>
                  Find <span className="font-medium">JET</span> →{" "}
                  <span className="font-medium">Notifications</span>.
                </li>
                <li>
                  Turn <span className="font-medium">Allow Notifications</span>{" "}
                  on, then reopen JET.
                </li>
              </ol>
            ) : (
            <ol className="space-y-2 my-5 text-sm text-foreground/80 list-decimal pl-5">
              <li>
                Tap the lock or settings icon in your browser's address bar.
              </li>
              <li>
                Open <span className="font-medium">Site settings</span> →{" "}
                <span className="font-medium">Notifications</span>.
              </li>
              <li>
                Switch notifications to{" "}
                <span className="font-medium">Allow</span>, then reload JET.
              </li>
            </ol>
            )
          ) : needsInstallFirst ? (
            <div className="space-y-2 my-5">
              <div className="flex items-center gap-2.5 text-sm">
                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10">
                  <Share className="h-3.5 w-3.5 text-primary" />
                </div>
                <span className="text-foreground/80">
                  1. Tap the Share button in Safari
                </span>
              </div>
              <div className="flex items-center gap-2.5 text-sm">
                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10">
                  <PlusSquare className="h-3.5 w-3.5 text-primary" />
                </div>
                <span className="text-foreground/80">
                  2. Choose "Add to Home Screen"
                </span>
              </div>
              <div className="flex items-center gap-2.5 text-sm">
                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10">
                  <Settings2 className="h-3.5 w-3.5 text-primary" />
                </div>
                <span className="text-foreground/80">
                  You can also enable alerts later in Settings
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-2 my-5">
              <div className="flex items-center gap-2.5 text-sm">
                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10">
                  <MapPin className="h-3.5 w-3.5 text-primary" />
                </div>
                <span className="text-foreground/80">
                  Deals near you, as they drop
                </span>
              </div>
              <div className="flex items-center gap-2.5 text-sm">
                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10">
                  <Zap className="h-3.5 w-3.5 text-primary" />
                </div>
                <span className="text-foreground/80">
                  Heads-up before a favorite ends
                </span>
              </div>
              <div className="flex items-center gap-2.5 text-sm">
                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10">
                  <Gift className="h-3.5 w-3.5 text-primary" />
                </div>
                <span className="text-foreground/80">
                  Exclusive member-only offers
                </span>
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground mb-4">
            No spam — only deals and updates you follow. You can turn alerts off
            any time in Settings.
          </p>

          <DialogFooter className="flex-row gap-3 sm:gap-3">
            <Button
              variant="ghost"
              className="flex-1 text-muted-foreground hover:text-foreground"
              onClick={handleDismiss}
              disabled={isLoading}
            >
              {needsInstallFirst || isBlocked ? "Close" : "Maybe Later"}
            </Button>
            {!needsInstallFirst &&
              (isBlocked ? (
                canOpenOsNotificationSettings() ? (
                  <Button
                    className="flex-1 bg-primary hover:bg-primary/90"
                    onClick={() => {
                      void openNotificationSettings();
                    }}
                  >
                    <Settings2 className="h-4 w-4 mr-1.5" />
                    Open settings
                  </Button>
                ) : null
              ) : (
                <Button
                  className="flex-1 bg-primary hover:bg-primary/90"
                  onClick={handleEnable}
                  disabled={isLoading}
                >
                  {isLoading ? "Enabling..." : "Enable Alerts"}
                </Button>
              ))}
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
};
