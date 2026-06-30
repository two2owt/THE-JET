import { useState, useEffect } from "react";
import { Bell, X, Zap, MapPin, Gift } from "lucide-react";
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

interface PushNotificationPromptProps {
  show: boolean;
  onDismiss: () => void;
}

const DISMISS_KEY = "push-notification-prompt-dismissed";
const DISMISS_DURATION = 14 * 24 * 60 * 60 * 1000; // 14 days

export const PushNotificationPrompt = ({ show, onDismiss }: PushNotificationPromptProps) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const { 
    isSupported: isWebPushSupported, 
    isSubscribed: isWebSubscribed, 
    subscribe: webSubscribe,
    permission: webPermission
  } = useWebPushNotifications();

  useEffect(() => {
    if (!show || isWebSubscribed) return;

    const dismissedAt = localStorage.getItem(DISMISS_KEY);
    if (dismissedAt) {
      const dismissTime = parseInt(dismissedAt, 10);
      if (Date.now() - dismissTime < DISMISS_DURATION) return;
      localStorage.removeItem(DISMISS_KEY);
    }

    if (webPermission === 'denied') return;

    const timer = setTimeout(() => setIsVisible(true), 1000);
    return () => clearTimeout(timer);
  }, [show, isWebSubscribed, webPermission]);

  const handleEnable = async () => {
    setIsLoading(true);
    let success = false;

    if (isWebPushSupported) {
      // subscribe() internally calls Notification.requestPermission()
      // only triggered here after the user taps Enable.
      success = await webSubscribe();
    } else if ("Notification" in window) {
      const permission = await Notification.requestPermission();
      success = permission === "granted";
    }

    setIsLoading(false);
    if (success) { setIsVisible(false); onDismiss(); }
  };

  const handleDismiss = () => {
    setIsVisible(false);
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
    onDismiss();
  };

  return (
    <Dialog
      open={isVisible}
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
            <DialogTitle className="text-lg font-semibold">Stay in the Loop</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Get instant alerts for deals near you and never miss out on exclusive offers. Your browser will ask for permission after you tap Enable.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 my-5">
            <div className="flex items-center gap-2.5 text-sm">
              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10">
                <MapPin className="h-3.5 w-3.5 text-primary" />
              </div>
              <span className="text-foreground/80">Location-based deal alerts</span>
            </div>
            <div className="flex items-center gap-2.5 text-sm">
              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10">
                <Zap className="h-3.5 w-3.5 text-primary" />
              </div>
              <span className="text-foreground/80">Real-time notifications</span>
            </div>
            <div className="flex items-center gap-2.5 text-sm">
              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10">
                <Gift className="h-3.5 w-3.5 text-primary" />
              </div>
              <span className="text-foreground/80">Exclusive member offers</span>
            </div>
          </div>

          <DialogFooter className="flex-row gap-3 sm:gap-3">
            <Button
              variant="ghost"
              className="flex-1 text-muted-foreground hover:text-foreground"
              onClick={handleDismiss}
              disabled={isLoading}
            >
              Maybe Later
            </Button>
            <Button
              className="flex-1 bg-primary hover:bg-primary/90"
              onClick={handleEnable}
              disabled={isLoading}
            >
              {isLoading ? "Enabling..." : "Enable Alerts"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
};
