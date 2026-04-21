import { memo, useState, useEffect, useCallback, lazy, Suspense } from "react";
import { Clock, MapPin, Share2, Heart, X, ExternalLink, Navigation } from "lucide-react";
import { Button } from "./ui/button";
import { OptimizedImage } from "./ui/optimized-image";
import { toast } from "sonner";
import { shareDeal } from "@/utils/shareUtils";
import { useFavorites } from "@/hooks/useFavorites";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import type { Venue } from "@/types/venue";

const DirectionsDialog = lazy(() => import("./DirectionsDialog"));

// Defer haptics import - only loaded when user interacts
const triggerHaptic = async () => {
  try {
    const { glideHaptic } = await import("@/lib/haptics");
    await glideHaptic();
  } catch {
    // Haptics not available
  }
};

interface Deal {
  id: string;
  title: string;
  description: string;
  venue_name: string;
  venue_address?: string | null;
  deal_type: string;
  expires_at: string;
  starts_at?: string;
  image_url: string | null;
  website_url: string | null;
  active_days?: number[] | null;
  neighborhoods?: {
    id: string;
    name: string;
    center_lat: number;
    center_lng: number;
  } | null;
  distance?: number;
}

interface DealDetailCardProps {
  deal: Deal;
  onClose: () => void;
}

export const DealDetailCard = memo(({ deal, onClose }: DealDetailCardProps) => {
  const [user, setUser] = useState<any>(null);
  const [showDirections, setShowDirections] = useState(false);
  
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const { isFavorite, toggleFavorite } = useFavorites(user?.id);
  const isFav = isFavorite(deal.id);

  const handleShare = async () => {
    await triggerHaptic();
    
    const result = await shareDeal({
      id: deal.id,
      title: deal.title,
      venue_name: deal.venue_name,
      description: deal.description,
    }, user?.id);
    
    if (result.success) {
      if (result.method === "native") {
        toast.success("Shared successfully!", {
          description: `${deal.title} shared with others`,
        });
      } else {
        toast.success("Copied to clipboard!", {
          description: "Share link copied - paste it anywhere",
        });
      }
    } else if (result.method === "native") {
      return;
    } else {
      toast.error("Couldn't share", {
        description: "Please try again",
      });
    }
  };

  const handleFavoriteToggle = async () => {
    await triggerHaptic();
    await toggleFavorite(deal.id);
  };

  const handleGetDirections = async () => {
    await triggerHaptic();
    setShowDirections(true);
  };

  const directionsVenue: Venue = {
    id: deal.id,
    name: deal.venue_name,
    lat: deal.neighborhoods?.center_lat ?? 0,
    lng: deal.neighborhoods?.center_lng ?? 0,
    activity: 0,
    category: deal.deal_type,
    neighborhood: deal.neighborhoods?.name ?? "",
    address: deal.venue_address ?? undefined,
  };

  const handleViewWebsite = () => {
    if (deal.website_url) {
      window.open(deal.website_url, "_blank");
    }
  };

  const getDealTypeColor = (type: string) => {
    switch (type.toLowerCase()) {
      case "offer":
        return "bg-primary/10 text-primary border-primary/20";
      case "event":
        return "bg-accent/10 text-accent border-accent/20";
      case "special":
        return "bg-secondary/10 text-secondary border-secondary/20";
      default:
        return "bg-muted text-muted-foreground border-border";
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  };

  const getTimeRemaining = (expiresAt: string) => {
    const now = new Date();
    const expires = new Date(expiresAt);
    const diff = expires.getTime() - now.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days} day${days > 1 ? 's' : ''} left`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} left`;
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${minutes} minute${minutes > 1 ? 's' : ''} left`;
  };

  const getDealIcon = (dealType: string) => {
    switch (dealType) {
      case 'offer': return '🎉';
      case 'event': return '🎵';
      case 'special': return '⭐';
      default: return '💎';
    }
  };

  return (
    <div className="bg-card rounded-xl sm:rounded-2xl overflow-hidden border border-border shadow-[var(--shadow-card)] transition-all duration-300 relative">
      {/* Close Button */}
      <button
        onClick={onClose}
        className="absolute top-2 right-2 sm:top-3 sm:right-3 z-10 bg-background/90 backdrop-blur-md p-1.5 sm:p-2 rounded-full hover:bg-background transition-colors"
        aria-label="Close"
      >
        <X className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-foreground" />
      </button>

      {/* Image Header with Gradient Overlay */}
      <div className="relative h-40 sm:h-48 md:h-56 bg-gradient-to-br from-primary/20 via-accent/20 to-secondary/20 overflow-hidden">
        {deal.image_url ? (
          <OptimizedImage
            src={deal.image_url}
            alt={deal.title}
            className="absolute inset-0 w-full h-full object-cover"
            responsive={true}
            responsiveSizes={["small", "medium", "large"]}
            sizesConfig={{ mobile: "100vw", tablet: "640px", desktop: "800px" }}
            quality={85}
            aspectRatio="16/10"
            eager={true}
            fetchPriority="high"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-6xl">{getDealIcon(deal.deal_type)}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background/60 to-transparent" />

        {/* Favorite Button */}
        <button
          onClick={handleFavoriteToggle}
          className="absolute top-2 left-2 sm:top-3 sm:left-3 bg-background/90 backdrop-blur-md p-2 sm:p-2.5 rounded-full hover:bg-background transition-colors z-10"
          aria-label={isFav ? "Remove from favorites" : "Add to favorites"}
        >
          <Heart
            className={cn(
              "w-4 h-4 sm:w-5 sm:h-5 transition-colors",
              isFav ? "fill-red-500 text-red-500" : "text-foreground"
            )}
          />
        </button>

        {/* Deal Type Badge */}
        <div
          className={cn(
            "absolute bottom-2 left-2 sm:bottom-3 sm:left-3 backdrop-blur-md px-2 py-1 sm:px-3 sm:py-1.5 rounded-full border",
            getDealTypeColor(deal.deal_type)
          )}
        >
          <span className="text-[10px] sm:text-xs font-semibold capitalize">
            {deal.deal_type}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 sm:p-5 space-y-3 sm:space-y-4">
        {/* Title & Venue */}
        <div>
          <h3 className="text-xl sm:text-2xl font-bold text-foreground mb-1">
            {deal.title}
          </h3>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="text-xs sm:text-sm font-medium">{deal.venue_name}</span>
            </div>
            {deal.neighborhoods?.name && (
              <p className="text-xs text-muted-foreground/80 pl-5 sm:pl-6">{deal.neighborhoods.name}</p>
            )}
            {deal.venue_address && (
              <p className="text-xs text-muted-foreground/70 pl-5 sm:pl-6">{deal.venue_address}</p>
            )}
          </div>
        </div>

        {/* Description */}
        <p className="text-sm text-muted-foreground">
          {deal.description}
        </p>

        {/* Deal Info */}
        <div className="bg-gradient-to-r from-primary/10 via-accent/10 to-secondary/10 rounded-xl p-4 border border-primary/20">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center flex-shrink-0">
              <Clock className="w-5 h-5 text-primary-foreground" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-foreground mb-1">
                {getTimeRemaining(deal.expires_at)}
              </p>
              <p className="text-xs text-muted-foreground">
                Valid until {formatDate(deal.expires_at)}
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3">
          <Button
            onClick={handleShare}
            variant="outline"
            className="w-full border-border/60 hover:border-primary/60 hover:bg-primary/5 font-semibold py-6 rounded-xl transition-all duration-300 hover-scale"
          >
            <Share2 className="w-4 h-4 mr-2" />
            Share
          </Button>
          <Button
            onClick={handleGetDirections}
            variant="jet"
            className="w-full py-6 rounded-xl"
          >
            <Navigation className="w-4 h-4 mr-2" />
            Directions
          </Button>
        </div>

        {/* Website Link */}
        {deal.website_url && (
          <Button
            onClick={handleViewWebsite}
            variant="ghost"
            className="w-full text-primary hover:text-primary/80"
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            Visit Website
          </Button>
        )}
      </div>

      <Suspense fallback={null}>
        <DirectionsDialog
          open={showDirections}
          onOpenChange={setShowDirections}
          venue={directionsVenue}
        />
      </Suspense>
    </div>
  );
});

DealDetailCard.displayName = "DealDetailCard";
