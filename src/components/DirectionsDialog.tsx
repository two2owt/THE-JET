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

interface DirectionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  venue: Venue | null;
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

const DirectionsDialog = ({ open, onOpenChange, venue }: DirectionsDialogProps) => {
  const openDirections = async (app: DirectionsApp) => {
    if (!venue) return;

    await triggerSoarHaptic();

    const url = buildDirectionsUrl(app, venue);
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
          <Button
            onClick={() => openDirections('google')}
            variant="outline"
            className="h-auto py-3 sm:py-4 justify-start gap-2 sm:gap-3 hover:bg-accent transition-colors"
          >
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0">
              <MapIcon className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-white" />
            </div>
            <div className="text-left">
              <p className="text-sm sm:text-base font-semibold">Google Maps</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground">Navigate with Google</p>
            </div>
          </Button>
          
          <Button
            onClick={() => openDirections('apple')}
            variant="outline"
            className="h-auto py-3 sm:py-4 justify-start gap-2 sm:gap-3 hover:bg-accent transition-colors"
          >
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center flex-shrink-0">
              <Navigation className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-white" />
            </div>
            <div className="text-left">
              <p className="text-sm sm:text-base font-semibold">Apple Maps</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground">Navigate with Apple</p>
            </div>
          </Button>
          
          <Button
            onClick={() => openDirections('waze')}
            variant="outline"
            className="h-auto py-3 sm:py-4 justify-start gap-2 sm:gap-3 hover:bg-accent transition-colors"
          >
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center flex-shrink-0">
              <Zap className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-white" />
            </div>
            <div className="text-left">
              <p className="text-sm sm:text-base font-semibold">Waze</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground">Navigate with Waze</p>
            </div>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DirectionsDialog;
