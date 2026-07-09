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

const DISMISS_KEY = "location-permission-prompt-dismissed";
const ASKED_KEY = "location-permission-prompt-asked";
const DISMISS_DURATION = 14 * 24 * 60 * 60 * 1000; // 14 days

/**
 * First-visit foreground location prompt.
 *
 * Mounted on the map page so we ask right at the surface that benefits from
 * location. Waits for `navigator.permissions` to confirm the browser is in
 * `prompt` state before showing — never re-asks when already granted/denied.
 * Persists the granular `foreground_location` consent for signed-in users
 * (RLS scopes writes to auth.uid()); signed-out visitors get session-only
 * behavior via the dismissed flag.
 */
export const LocationPermissionPrompt = () => {
  const { session } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const maybeShow = async () => {
      if (typeof navigator === "undefined" || !("geolocation" in navigator)) return;

      // Respect earlier dismissal within window.
      const dismissedAt = localStorage.getItem(DISMISS_KEY);
      if (dismissedAt) {
        const t = parseInt(dismissedAt, 10);
        if (Number.isFinite(t) && Date.now() - t < DISMISS_DURATION) return;
        localStorage.removeItem(DISMISS_KEY);
      }

      // Only prompt if browser is in `prompt` state — never re-ask.
      try {
        const status = await navigator.permissions?.query?.({
          name: "geolocation" as PermissionName,
        });
        if (status && status.state !== "prompt") return;
      } catch {
        // Permissions API unsupported — fall through and show once.
        if (localStorage.getItem(ASKED_KEY)) return;
      }

      if (cancelled) return;
      // Small delay so we don't compete with first paint / other prompts.
      const timer = window.setTimeout(() => {
        if (!cancelled) setOpen(true);
      }, 2500);
      return () => window.clearTimeout(timer);
    };

    const cleanup = maybeShow();
    return () => {
      cancelled = true;
      Promise.resolve(cleanup).then((fn) => typeof fn === "function" && fn());
    };
  }, []);

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
      if (import.meta.env.DEV) console.warn("[location-prompt] consent write failed", e);
    }
  };

  const handleEnable = async () => {
    setLoading(true);
    localStorage.setItem(ASKED_KEY, "1");

    const granted = await new Promise<boolean>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        () => resolve(true),
        () => resolve(false),
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
      );
    });

    await recordConsent(granted);
    setLoading(false);
    setOpen(false);

    if (granted) {
      toast.success("Location enabled", {
        description: "We'll show deals near you.",
      });
    } else {
      localStorage.setItem(DISMISS_KEY, Date.now().toString());
      toast.error("Location blocked", {
        description: "You can re-enable it anytime in Settings → Privacy.",
      });
    }
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
    localStorage.setItem(ASKED_KEY, "1");
    void recordConsent(false);
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
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
              <span className="text-foreground/80">Nearby deals ranked by distance</span>
            </div>
            <div className="flex items-center gap-2.5 text-sm">
              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10">
                <MapPin className="h-3.5 w-3.5 text-primary" />
              </div>
              <span className="text-foreground/80">Center the map on where you are</span>
            </div>
            <div className="flex items-center gap-2.5 text-sm">
              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10">
                <Zap className="h-3.5 w-3.5 text-primary" />
              </div>
              <span className="text-foreground/80">Live venue activity in real time</span>
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