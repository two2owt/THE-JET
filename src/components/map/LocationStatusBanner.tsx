import { useState } from "react";
import { MapPinOff, X, Loader2, Settings2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useLocationPreferences } from "@/hooks/useLocationPreferences";
import { useGeolocationPermission } from "@/hooks/useGeolocationPermission";
import { openLocationSettings } from "@/lib/nativeBackgroundGeolocation";
import { isNativeApp, getPlatform } from "@/lib/platform";

const platformSteps: Record<
  "ios" | "android" | "web",
  { label: string; steps: string[] }
> = {
  ios: {
    label: "iOS Settings",
    steps: [
      "Open Settings → Privacy & Security → Location Services.",
      "Find JET (or Safari for mobile web) and tap it.",
      "Select 'While Using the App' or 'Always'.",
      "Return to JET and pull down to refresh.",
    ],
  },
  android: {
    label: "Android Settings",
    steps: [
      "Open Settings → Location, then make sure Location is on.",
      "Go to Apps → JET → Permissions → Location.",
      "Choose 'Allow all the time' or 'Allow only while using the app'.",
      "Return to JET and pull down to refresh.",
    ],
  },
  web: {
    label: "Browser Settings",
    steps: [
      "Tap the lock/info icon in your browser's address bar.",
      "Find 'Location' and change it to 'Allow'.",
      "Refresh the page.",
    ],
  },
};

function getWebPlatform(): "ios" | "android" | "web" {
  if (typeof navigator === "undefined") return "web";
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  if (/android/.test(ua)) return "android";
  return "web";
}

/**
 * Map-tab status banner that reflects the *effective* tracking state.
 *
 * `location_tracking_enabled` alone is not enough — if the browser/OS has not
 * granted geolocation, nothing is being collected, so we surface that clearly
 * with a one-tap way to fix it.
 */
export const LocationStatusBanner = ({ className }: { className?: string }) => {
  const { session } = useAuth();
  const { locationTrackingEnabled, isLoading } = useLocationPreferences();
  const { permission, isGranted, isBlocked, promptSuppressed, mustUseSettings, request } =
    useGeolocationPermission();
  const [dismissed, setDismissed] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [showSteps, setShowSteps] = useState(false);

  const unsupported = permission === "unsupported";
  const undetermined = permission === "unknown";

  if (
    !session?.user ||
    isLoading ||
    dismissed ||
    undetermined ||
    (isGranted && locationTrackingEnabled)
  )
    return null;

  // Tracking preference is off and permission is granted: nothing to warn about
  // beyond the settings toggle, keep the map clean.
  if (!locationTrackingEnabled && isGranted) return null;

  const title = unsupported
    ? "Location unavailable on this device"
    : mustUseSettings
      ? "Location tracking is off — access blocked"
      : !locationTrackingEnabled
        ? "Location tracking is off"
        : "Location tracking is off — permission needed";

  const description = unsupported
    ? "Your browser doesn't support location, so live activity near you can't be personalized."
    : mustUseSettings
      ? isNativeApp()
        ? "Allow location for JET in your device settings to see live activity near you."
        : promptSuppressed && !isBlocked
          ? "Your browser won't ask again — allow location for this site in your browser settings."
          : "Re-allow location for this site in your browser settings to see live activity near you."
      : "Turn on location so your map shows live activity around you.";

  const stepsKey = isNativeApp() ? getPlatform() : getWebPlatform();
  const steps = platformSteps[stepsKey] ?? platformSteps.web;

  return (
    <div
      className={`pointer-events-auto w-[min(92vw,26rem)] rounded-2xl border border-border/60 bg-background/85 backdrop-blur-xl shadow-card px-3 py-2.5 ${className ?? ""}`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-2.5">
        <MapPinOff className="w-4 h-4 mt-0.5 text-primary flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-foreground leading-snug">
            {title}
          </p>
          <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
            {description}
          </p>
          {!unsupported && (
            <div className="mt-2 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                {mustUseSettings ? (
                  <Button
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => {
                      if (isNativeApp()) {
                        void openLocationSettings();
                      } else {
                        setShowSteps((s) => !s);
                      }
                    }}
                    aria-expanded={mustUseSettings && !isNativeApp() ? showSteps : undefined}
                  >
                    <Settings2 className="w-3.5 h-3.5 mr-1.5" />
                    {isNativeApp() ? "Open settings" : "How to enable"}
                    {!isNativeApp() && (
                      <ChevronDown
                        className={`w-3 h-3 ml-1 transition-transform ${showSteps ? "rotate-180" : ""}`}
                      />
                    )}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className="h-8 text-xs"
                    disabled={requesting}
                    onClick={async () => {
                      setRequesting(true);
                      try {
                        await request();
                      } finally {
                        setRequesting(false);
                      }
                    }}
                  >
                    {requesting && (
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    )}
                    Enable location
                  </Button>
                )}
              </div>

              {mustUseSettings && !isNativeApp() && showSteps && (
                <div className="rounded-xl border border-border/50 bg-background/70 p-2.5">
                  <p className="text-[11px] font-semibold text-foreground mb-1.5">
                    {steps.label}
                  </p>
                  <ol className="list-decimal list-inside space-y-1">
                    {steps.steps.map((step, i) => (
                      <li
                        key={i}
                        className="text-[11px] text-muted-foreground leading-snug"
                      >
                        {step}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          )}
        </div>
        <button
          type="button"
          aria-label="Dismiss location status"
          onClick={() => setDismissed(true)}
          className="p-1.5 -m-1 rounded-full text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

export default LocationStatusBanner;
