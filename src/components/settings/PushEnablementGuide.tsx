import { Bell, BellOff, CheckCircle2, PlusSquare, Share, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PushEnablementGuideProps {
  isSupported: boolean;
  isSubscribed: boolean;
  permission: NotificationPermission;
  isLoading?: boolean;
  onEnable: () => void;
}

const isIOS = () =>
  typeof navigator !== "undefined" &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && (navigator as any).maxTouchPoints > 1));

const isStandalone = () =>
  typeof window !== "undefined" &&
  (window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true);

const Step = ({ icon: Icon, children }: { icon: typeof Share; children: React.ReactNode }) => (
  <li className="flex items-start gap-2.5 text-xs sm:text-sm text-foreground/80">
    <span className="mt-0.5 flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 shrink-0">
      <Icon className="w-3.5 h-3.5 text-primary" />
    </span>
    <span className="min-w-0">{children}</span>
  </li>
);

/**
 * Explains — per device — exactly how alerts get enabled and where they show
 * up once they are. Rendered under the Notifications section in Settings.
 */
export const PushEnablementGuide = ({
  isSupported,
  isSubscribed,
  permission,
  isLoading,
  onEnable,
}: PushEnablementGuideProps) => {
  const needsInstallFirst = isIOS() && !isStandalone();
  const blocked = permission === "denied";

  return (
    <div className="rounded-xl border-hairline bg-popover/40 p-3 sm:p-4 space-y-3">
      <div className="flex items-center gap-2">
        {isSubscribed ? (
          <CheckCircle2 className="w-4 h-4 text-primary" />
        ) : blocked ? (
          <BellOff className="w-4 h-4 text-muted-foreground" />
        ) : (
          <Bell className="w-4 h-4 text-primary" />
        )}
        <p className="text-xs sm:text-sm font-medium text-foreground">
          {isSubscribed
            ? "Alerts are on for this device"
            : blocked
              ? "Alerts are blocked in this browser"
              : "How alerts work on your phone"}
        </p>
      </div>

      {isSubscribed ? (
        <ul className="space-y-2">
          <Step icon={Bell}>
            JET open: alerts appear as an in-app banner with a <span className="font-medium">View</span> button
            that opens the deal or venue card.
          </Step>
          <Step icon={Smartphone}>
            JET closed or in the background: alerts arrive on your lock screen — tapping one opens JET straight
            to that deal.
          </Step>
          <Step icon={CheckCircle2}>
            Every alert is also saved to the <span className="font-medium">Alerts</span> tab, so nothing is missed.
          </Step>
        </ul>
      ) : blocked ? (
        <ol className="space-y-2 list-decimal pl-5 text-xs sm:text-sm text-foreground/80">
          <li>Tap the lock or settings icon in your browser's address bar.</li>
          <li>Open <span className="font-medium">Site settings</span> → <span className="font-medium">Notifications</span>.</li>
          <li>Switch to <span className="font-medium">Allow</span>, reload JET, then flip the toggle above.</li>
        </ol>
      ) : needsInstallFirst ? (
        <ul className="space-y-2">
          <Step icon={Share}>1. Tap the Share button in Safari.</Step>
          <Step icon={PlusSquare}>2. Choose "Add to Home Screen".</Step>
          <Step icon={Bell}>3. Reopen JET from your Home Screen and tap Enable — iPhone and iPad only deliver
            alerts to installed apps.</Step>
        </ul>
      ) : (
        <ul className="space-y-2">
          <Step icon={Bell}>Tap Enable, then choose <span className="font-medium">Allow</span> in your phone's popup.</Step>
          <Step icon={Smartphone}>Android and desktop deliver alerts even when JET is closed.</Step>
          <Step icon={CheckCircle2}>While JET is open, alerts show in-app instead of on your lock screen.</Step>
        </ul>
      )}

      {!isSubscribed && !blocked && !needsInstallFirst && isSupported && (
        <Button size="sm" className="w-full sm:w-auto" onClick={onEnable} disabled={isLoading}>
          {isLoading ? "Enabling..." : "Enable Alerts"}
        </Button>
      )}
    </div>
  );
};
