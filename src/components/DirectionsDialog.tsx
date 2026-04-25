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
  const openDirections = async (app: 'google' | 'apple' | 'waze') => {
    if (!venue) return;

    await triggerSoarHaptic();

    const { lat, lng, address, name } = venue;
    const hasCoords =
      typeof lat === 'number' && typeof lng === 'number' &&
      Number.isFinite(lat) && Number.isFinite(lng) &&
      lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
    const label = encodeURIComponent(name || address || 'Destination');
    const addressQuery = address ? encodeURIComponent(address) : '';

    let url = '';

    switch (app) {
      case 'google':
        // Prefer coords for determinism; fall back to address text.
        // Never pass `destination_place_id` unless it's a real Google Place ID.
        if (hasCoords) {
          url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
        } else if (addressQuery) {
          url = `https://www.google.com/maps/dir/?api=1&destination=${addressQuery}&travelmode=driving`;
        } else {
          url = `https://www.google.com/maps/search/?api=1&query=${label}`;
        }
        break;
      case 'apple':
        // Apple Maps: HTTPS, coords + named label via `q` for the pin title.
        if (hasCoords) {
          url = `https://maps.apple.com/?daddr=${lat},${lng}&q=${label}&dirflg=d`;
        } else if (addressQuery) {
          url = `https://maps.apple.com/?daddr=${addressQuery}&q=${label}&dirflg=d`;
        } else {
          url = `https://maps.apple.com/?q=${label}`;
        }
        break;
      case 'waze':
        // Waze: `ll` is the canonical coord param; `q` is a free-text fallback.
        if (hasCoords) {
          url = `https://www.waze.com/ul?ll=${lat}%2C${lng}&navigate=yes&zoom=17`;
        } else if (addressQuery) {
          url = `https://www.waze.com/ul?q=${addressQuery}&navigate=yes`;
        } else {
          url = `https://www.waze.com/ul?q=${label}&navigate=yes`;
        }
        break;
    }

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
