import { memo, useState, useEffect } from "react";
import { Clock, MapPin, Share2, Heart } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { Button } from "./ui/button";
import { OptimizedImage } from "./ui/optimized-image";
import { glideHaptic } from "@/lib/haptics";
import { toast } from "sonner";
import { shareDeal } from "@/utils/shareUtils";
import { useFavorites } from "@/hooks/useFavorites";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { UpgradePrompt, useFeatureAccess } from "./UpgradePrompt";
import { useNavigate } from "@/lib/router-compat";

interface Deal {
  id: string;
  title: string;
  venue_name: string;
  description: string;
  deal_type: string;
  image_url: string | null;
  active_days: number[];
  starts_at: string;
  expires_at: string;
  venue_id?: string | null;
}

interface DealCardProps {
  deal: Deal;
  /** Card index in list - used for lazy loading (index >= 2 defers image loading) */
  index?: number;
  /** Overrides the default "open this deal's JetCard on the map" behaviour. */
  onOpen?: () => void;
}

export const DealCard = memo(({ deal, index = 0, onOpen }: DealCardProps) => {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const { canAccessSocialFeatures } = useFeatureAccess();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const { isFavorite, toggleFavorite } = useFavorites(user?.id);
  const isFav = isFavorite(deal.id);

  const handleShare = async () => {
    // Check if user has JET+ subscription for sharing
    if (!canAccessSocialFeatures()) {
      setShowUpgradePrompt(true);
      return;
    }

    await glideHaptic();

    const result = await shareDeal(deal, user?.id);

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
      // Native share was cancelled, don't show error
      return;
    } else {
      toast.error("Couldn't share", {
        description: "Please try again",
      });
    }
  };

  // Tapping the card opens the venue's JetCard on the map. Prefer the stable
  // venue id; fall back to the deal deep link, which resolves its venue.
  const handleOpen = () => {
    if (onOpen) {
      onOpen();
      return;
    }
    void glideHaptic();
    if (deal.venue_id) {
      navigate(`/?venue=${encodeURIComponent(deal.venue_id)}`);
    } else {
      navigate(`/?deal=${encodeURIComponent(deal.id)}`);
    }
  };

  const handleFavoriteToggle = async () => {
    await glideHaptic();
    // Removing is destructive — confirm first. Saving stays a single tap.
    if (isFav) {
      setConfirmRemoveOpen(true);
      return;
    }
    await toggleFavorite(deal.id);
  };

  const handleConfirmRemove = async () => {
    if (removing) return;
    setRemoving(true);
    try {
      await toggleFavorite(deal.id);
      toast.success("Removed from favorites", { description: deal.title });
    } finally {
      setRemoving(false);
      setConfirmRemoveOpen(false);
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
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleOpen();
        }
      }}
      aria-label={`Open ${deal.venue_name} on the map`}
      className="bg-card rounded-xl sm:rounded-2xl overflow-hidden border border-border shadow-[var(--shadow-card)] transition-all duration-300 hover-scale cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
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
            deferLoad={index >= 2}
            eager={index === 0}
            fetchPriority={index === 0 ? "high" : undefined}
            fallback={
              <img
                src="/placeholder.svg"
                alt="Placeholder"
                className="absolute inset-0 w-full h-full object-cover brightness-[0.25]"
              />
            }
          />
        ) : (
          <img
            src="/placeholder.svg"
            alt="Placeholder"
            className="absolute inset-0 w-full h-full object-cover brightness-[0.25]"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background/60 to-transparent" />

        {/* Favorite Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            void handleFavoriteToggle();
          }}
          className="absolute top-2 right-2 sm:top-3 sm:right-3 bg-background/90 backdrop-blur-md p-2.5 sm:p-2.5 rounded-full hover:bg-background transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center touch-manipulation"
          aria-label={isFav ? "Remove from favorites" : "Add to favorites"}
        >
          <Heart
            className={cn(
              "w-4 h-4 sm:w-5 sm:h-5 transition-colors",
              isFav ? "fill-red-500 text-red-500" : "text-foreground",
            )}
          />
        </button>

        {/* Deal Type Badge */}
        <div
          className={cn(
            "absolute top-2 left-2 sm:top-3 sm:left-3 backdrop-blur-md px-2 py-1 sm:px-3 sm:py-1.5 rounded-full border",
            getDealTypeColor(deal.deal_type),
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
          <div className="flex items-center gap-2 text-muted-foreground">
            <MapPin className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span className="text-xs sm:text-sm">{deal.venue_name}</span>
          </div>
        </div>

        {/* Description */}
        <p className="text-sm text-muted-foreground line-clamp-2">
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
                Valid until {formatDate(deal.expires_at)}
              </p>
              <p className="text-xs text-muted-foreground">
                {deal.active_days.length === 7
                  ? "Available every day"
                  : `Available on select days`}
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3">
          <Button
            onClick={(e) => {
              e.stopPropagation();
              void handleShare();
            }}
            variant="outline"
            className="w-full border-border/60 hover:border-primary/60 hover:bg-primary/5 font-semibold py-6 rounded-xl transition-all duration-300 hover-scale"
          >
            <Share2 className="w-4 h-4 mr-2" />
            Share
          </Button>
          <Button
            variant="jet"
            className="w-full py-6 rounded-xl"
            onClick={(e) => {
              e.stopPropagation();
              handleOpen();
            }}
          >
            View Details
          </Button>
        </div>
      </div>

      <UpgradePrompt
        requiredTier="jet_plus"
        featureName="Deal sharing"
        isOpen={showUpgradePrompt}
        onClose={() => setShowUpgradePrompt(false)}
      />

      <AlertDialog
        open={confirmRemoveOpen}
        onOpenChange={setConfirmRemoveOpen}
      >
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from favorites?</AlertDialogTitle>
            <AlertDialogDescription>
              {deal.title} at {deal.venue_name} will no longer appear in your
              saved list. You can save it again anytime.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Keep</AlertDialogCancel>
            <AlertDialogAction
              disabled={removing}
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmRemove();
              }}
            >
              {removing ? "Removing…" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
});
