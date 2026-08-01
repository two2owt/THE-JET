import { useEffect, useMemo, useState } from "react";
import { Map as MapIcon, Navigation, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Venue } from "@/types/venue";
import { buildDirectionsUrl, type DirectionsApp } from "@/lib/directions-url";
import { getLastDirectionsApp, setLastDirectionsApp } from "@/lib/lastDirectionsApp";

interface DirectionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  venue: Venue | null;
  /** Google Place ID for the destination, when known (parking spots, POIs). */
  placeId?: string | null;
}

// Dynamic import for haptics to reduce initial bundle
const triggerSoarHaptic = async () => {
  try {
    const { soarHaptic } = await import("@/lib/haptics");
    await soarHaptic();
  } catch {
    // Haptics not available
  }
};

const APPS: {
  id: DirectionsApp;
  label: string;
  hint: string;
  icon: typeof MapIcon;
  swatch: string;
}[] = [
  { id: "google", label: "Google Maps", hint: "Navigate with Google", icon: MapIcon, swatch: "from-blue-500 to-blue-600" },
  { id: "apple", label: "Apple Maps", hint: "Navigate with Apple", icon: Navigation, swatch: "from-gray-800 to-gray-900" },
  { id: "waze", label: "Waze", hint: "Navigate with Waze", icon: Zap, swatch: "from-cyan-400 to-blue-500" },
];

const DirectionsDialog = ({ open, onOpenChange, venue, placeId }: DirectionsDialogProps) => {
  const [lastApp, setLastApp] = useState<DirectionsApp | null>(null);

  // Re-read on each open so a pick made elsewhere in the session is reflected.
  useEffect(() => {
    if (open) setLastApp(getLastDirectionsApp());
  }, [open]);

  // Preferred app floats to the top of the list.
  const orderedApps = useMemo(
    () => (lastApp ? [...APPS].sort((a, b) => (a.id === lastApp ? -1 : b.id === lastApp ? 1 : 0)) : APPS),
    [lastApp],
  );

  const openDirections = async (app: DirectionsApp) => {
    if (!venue) return;

    await triggerSoarHaptic();

    setLastDirectionsApp(app);
    setLastApp(app);

    const url = buildDirectionsUrl(app, venue, { placeId });
    const { address, name } = venue;

    if (!url) {
      toast.error('Unable to open directions', {
        description: 'No location data available for this venue.',
      });
      return;
    }

    // `noopener,noreferrer` prevents the new tab from accessing window.opener.
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    if (!opened) {
      // Popup blocked — fall back to same-tab navigation so the user still gets there.
      window.location.href = url;
    }
    onOpenChange(false);

    toast.success(
      `Opening ${app === 'google' ? 'Google Maps' : app === 'apple' ? 'Apple Maps' : 'Waze'}`,
      { description: `Navigate to ${name || address || 'destination'}` },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md mx-4 sm:mx-0">
        <DialogHeader>
          <DialogTitle className="text-base sm:text-lg">Choose Navigation App</DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            Select your preferred navigation app to get directions to {venue?.name}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 sm:gap-3 py-3 sm:py-4">
          {orderedApps.map(({ id, label, hint, icon: Icon, swatch }) => {
            const isPreferred = id === lastApp;
            return (
              <Button
                key={id}
                onClick={() => openDirections(id)}
                variant="outline"
                autoFocus={isPreferred}
                aria-label={isPreferred ? `${label} (last used)` : label}
                className={`h-auto py-3 sm:py-4 justify-start gap-2 sm:gap-3 hover:bg-accent transition-colors ${
                  isPreferred ? 'border-primary/60 bg-primary/5 ring-1 ring-primary/40' : ''
                }`}
              >
                <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-gradient-to-br ${swatch} flex items-center justify-center flex-shrink-0`}>
                  <Icon className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-white" />
                </div>
                <div className="text-left">
                  <p className="text-sm sm:text-base font-semibold">{label}</p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">{hint}</p>
                </div>
                {isPreferred && (
                  <span className="ml-auto text-[10px] sm:text-xs font-medium text-primary whitespace-nowrap">
                    Last used
                  </span>
                )}
              </Button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DirectionsDialog;
