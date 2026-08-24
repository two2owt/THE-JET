import { useEffect, useState } from "react";
import { MapPin, Navigation, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { refreshConsents } from "@/lib/consent";
import { usePromptSlot, PROMPT_PRIORITY } from "@/hooks/usePromptSlot";
import {
  markLocationPermissionResolved,
  markLocationPromptDismissed,
  markLocationPromptShown,
  sessionSignature,
  shouldPromptForLocation,
} from "@/lib/locationPromptPolicy";
import { recordPromptOutcome } from "@/lib/locationDiagnostics";
import { useDeferredPromptTrigger } from "@/hooks/useDeferredPromptTrigger";
import { logGeoPermissionEvent } from "@/lib/locationPermissionLog";
import {
  isPromptSuppressed,
  recordPromptAttempt,
} from "@/lib/geolocationPromptSuppression";

/**
 * Module-level latch: guarantees only one prompt instance can ever open per
 * page load, even if the component double-mounts (StrictMode, lazy remount,
 * route churn). Prevents stacked/duplicate dialogs. Keyed by sign-in
 * signature so a sign-out → sign-in inside one page load still re-asks.
 */
let promptShownFor: string | null = null;

/**
 * Foreground location prompt.
 *
 * Mounted app-wide in `AppShell`, so it appears immediately after sign-in on
 * whatever route the user lands on — no need to visit the map tab first. Waits
 * for `navigator.permissions` to confirm the browser is in `prompt` state
 * before showing — never re-asks when already granted/denied.
 * Re-ask cadence lives in `@/lib/locationPromptPolicy`: every new sign-in gets
 * a fresh ask (subject to a minimum gap), and dismissals snooze with a
 * backoff instead of silencing the prompt forever.
 * Persists the granular `foreground_location` consent for signed-in users
 * (RLS scopes writes to auth.uid()); signed-out visitors get session-only
 * behavior via the dismissed flag.
 */
export const LocationPermissionPrompt = () => {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const signature = sessionSignature(userId, session?.user?.last_sign_in_at);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  // Only ever render while this prompt owns the global dialog slot, so it can
  // never stack with the push / PWA prompts.
  const hasSlot = usePromptSlot("location", PROMPT_PRIORITY.location, open);

  useEffect(() => {
    let cancelled = false;

    const maybeShow = async () => {
      if (typeof navigator === "undefined" || !("geolocation" in navigator))
        return;
      if (promptShownFor === signature) return;

      const permissionsApiAvailable = Boolean(navigator.permissions?.query);
      const decision = shouldPromptForLocation({
        signature,
        permissionsApiAvailable,
      });
      if (!decision.show) {
        if (import.meta.env.DEV)
          console.debug("[location-prompt] suppressed:", decision.reason);
        if (userId) recordPromptOutcome("suppressed");
        logGeoPermissionEvent({
          outcome: "suppressed",
          surface: "first_visit_prompt",
          promptSuppressed: true,
          detail: decision.reason,
        });
        return;
      }

      // Only prompt if browser is in `prompt` state — never re-ask.
      let status: PermissionStatus | undefined;
      try {
        status = await navigator.permissions?.query?.({
          name: "geolocation" as PermissionName,
        });
        if (status) {
          if (status.state === "granted") {
            // Granted elsewhere (signup flow, map locate button, OS settings):
            // clear the snooze so nothing re-asks and stay silent.
            markLocationPermissionResolved(signature);
            if (userId) recordPromptOutcome("granted");
            return;
          }
          if (status.state !== "prompt") return;
          // Close/suppress the dialog the moment permission is granted or
          // blocked through any other surface, so the user never sees a
          // second ask for something they already answered.
          status.onchange = () => {
            if (cancelled) return;
            if (status!.state !== "prompt") {
              promptShownFor = signature;
              setOpen(false);
              if (status!.state === "granted")
                markLocationPermissionResolved(signature);
              else markLocationPromptDismissed(signature);
            }
          };
        }
      } catch {
        // Permissions API unsupported — the policy above already applied the
        // legacy asked-once guard, so fall through and show.
      }

      if (cancelled) return;
      // The browser has stopped surfacing the prompt (auto-block after repeat
      // dismissals, embedded webview, etc.). Asking again does nothing, so we
      // stay quiet and let the map banner point at the settings flow instead.
      if (isPromptSuppressed()) return;
      // Small delay so we don't compete with first paint / other prompts.
      // Signed-in users get asked promptly so tracking can start right away.
      const delay = userId ? 900 : 2500;
      const timer = window.setTimeout(() => {
        // Re-check at fire time: permission may have been granted during the
        // delay (map locate button, signup consent), which would otherwise
        // surface a redundant prompt.
        if (cancelled || promptShownFor === signature) return;
        if (status && status.state !== "prompt") return;
        promptShownFor = signature;
        markLocationPromptShown(signature);
        if (userId) recordPromptOutcome("shown");
        logGeoPermissionEvent({
          outcome: "prompt_shown",
          surface: "first_visit_prompt",
          method: "ui",
        });
        setOpen(true);
      }, delay);
      return () => {
        window.clearTimeout(timer);
        if (status) status.onchange = null;
      };
    };

    const cleanup = maybeShow();
    return () => {
      cancelled = true;
      Promise.resolve(cleanup).then((fn) => typeof fn === "function" && fn());
    };
  }, [signature, userId]);

  const recordConsent = async (granted: boolean) => {
    if (!session?.user?.id) return;
    const now = new Date().toISOString();
    try {
      await supabase.from("user_consents").insert({
        user_id: session.user.id,
        consent_type: "foreground_location",
        granted,
        policy_version: "2025-06",
        source: "first-visit.prompt",
        granted_at: granted ? now : null,
        revoked_at: granted ? null : now,
      });
      await refreshConsents();
    } catch (e) {
      if (import.meta.env.DEV)
        console.warn("[location-prompt] consent write failed", e);
    }
  };

  const handleEnable = async () => {
    setLoading(true);
    markLocationPromptShown(signature);

    const startedAt = Date.now();
    const result = await new Promise<{ granted: boolean; deniedError: boolean }>(
      (resolve) => {
        navigator.geolocation.getCurrentPosition(
          () => resolve({ granted: true, deniedError: false }),
          (err) => resolve({ granted: false, deniedError: err?.code === 1 }),
          { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
        );
      },
    );
    const granted = result.granted;
    // Detect a silently-suppressed prompt so the UI switches to "Open settings".
    recordPromptAttempt({
      outcome: granted ? "granted" : result.deniedError ? "denied" : "prompt",
      durationMs: Date.now() - startedAt,
      deniedError: result.deniedError,
    });

    // Only ever record a grant here. A browser-level block is not an explicit
    // app-level opt-out — Settings → Location Tracking is the only switch that
    // revokes foreground location consent.
    if (granted) {
      await recordConsent(true);
      markLocationPermissionResolved(signature);
    }
    recordPromptOutcome(granted ? "granted" : "denied");
    logGeoPermissionEvent({
      outcome: granted
        ? "granted"
        : result.deniedError
          ? "denied"
          : "dismissed",
      surface: "first_visit_prompt",
      method: "get_current_position",
      durationMs: Date.now() - startedAt,
      promptSuppressed: result.deniedError && Date.now() - startedAt < 500,
    });
    setLoading(false);
    setOpen(false);

    if (granted) {
      toast.success("Location enabled", {
        description: "We'll show deals near you.",
      });
    } else {
      markLocationPromptDismissed(signature);
      toast.error("Location blocked", {
        description: "You can re-enable it anytime in Settings → Privacy.",
      });
    }
  };

  const handleDismiss = () => {
    markLocationPromptDismissed(signature);
    recordPromptOutcome("dismissed");
    logGeoPermissionEvent({
      outcome: "dismissed",
      surface: "first_visit_prompt",
      method: "ui",
    });
    setOpen(false);
  };

  return (
    <Dialog
      open={open && hasSlot}
      onOpenChange={(next) => {
        if (!next && !loading) handleDismiss();
      }}
    >
      <DialogContent className="max-w-md p-0 overflow-hidden border-border/50 bg-background/95 backdrop-blur-xl">
        <div className="p-6">
          <DialogHeader className="space-y-3 text-left">
            <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20">
              <MapPin className="h-7 w-7 text-primary" />
            </div>
            <DialogTitle className="text-lg font-semibold">
              See deals happening around you
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Share your location so JET can surface the closest venues, deals,
              and live activity. Your browser will ask for permission after you
              tap Enable.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 my-5">
            <div className="flex items-center gap-2.5 text-sm">
              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10">
                <Navigation className="h-3.5 w-3.5 text-primary" />
              </div>
              <span className="text-foreground/80">
                Nearby deals ranked by distance
              </span>
            </div>
            <div className="flex items-center gap-2.5 text-sm">
              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10">
                <MapPin className="h-3.5 w-3.5 text-primary" />
              </div>
              <span className="text-foreground/80">
                Center the map on where you are
              </span>
            </div>
            <div className="flex items-center gap-2.5 text-sm">
              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10">
                <Zap className="h-3.5 w-3.5 text-primary" />
              </div>
              <span className="text-foreground/80">
                Live venue activity in real time
              </span>
            </div>
          </div>

          <DialogFooter className="flex-row gap-3 sm:gap-3">
            <Button
              variant="ghost"
              className="flex-1 text-muted-foreground hover:text-foreground"
              onClick={handleDismiss}
              disabled={loading}
            >
              Not now
            </Button>
            <Button
              className="flex-1 bg-primary hover:bg-primary/90"
              onClick={handleEnable}
              disabled={loading}
            >
              {loading ? "Enabling..." : "Enable location"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default LocationPermissionPrompt;
