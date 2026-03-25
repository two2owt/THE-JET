import { memo, useState, useEffect } from "react";
import { MapPin, Users, Star, TrendingUp, X, Share2 } from "lucide-react";
import { Button } from "./ui/button";
import { OptimizedImage } from "./ui/optimized-image";
import { glideHaptic } from "@/lib/haptics";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Venue } from "./MapboxHeatmap";
import { UpgradePrompt, useFeatureAccess } from "./UpgradePrompt";
import { shareVenue } from "@/utils/shareUtils";

interface JetCardProps {
  venue: Venue;
  onGetDirections: () => void;
  onClose?: () => void;
}

export const JetCard = memo(({ venue, onGetDirections, onClose }: JetCardProps) => {
  const [user, setUser] = useState<any>(null);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
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

  const getActivityLevel = (activity: number) => {
    if (activity >= 80) return { label: "🔥 Very Busy", color: "text-hot" };
    if (activity >= 60) return { label: "🌟 Busy", color: "text-warm" };
    if (activity >= 40) return { label: "✨ Moderate", color: "text-cool" };
    return { label: "😌 Quiet", color: "text-cold" };
  };


  const handleGetDirections = async () => {
    await glideHaptic(); // Smooth gliding haptic feedback
    onGetDirections();
  };

  const handleShare = async () => {
    // Check if user has JET+ subscription for sharing
    if (!canAccessSocialFeatures()) {
      setShowUpgradePrompt(true);
      return;
    }

    await glideHaptic();
    
    const result = await shareVenue({ id: venue.id, name: venue.name });
    
    if (result.success) {
      if (result.method === "native") {
        toast.success("Shared successfully!", {
          description: `${venue.name} shared with others`,
        });
      } else {
        toast.success("Copied to clipboard!", {
          description: "Share link copied - paste it anywhere",
        });
      }
    } else if (result.method === "native") {
      // Native share was cancelled, don't show error
    } else {
      toast.error("Couldn't share", {
        description: "Please try again",
      });
    }
  };


  const activityLevel = getActivityLevel(venue.activity);

  return (
    <article 
      className="relative bg-card backdrop-blur-xl rounded-2xl sm:rounded-3xl overflow-hidden border border-border/80 dark:border-primary/30 shadow-lg dark:shadow-[0_8px_32px_rgba(0,0,0,0.5),0_0_0_1px_hsl(var(--primary)/0.2)] transition-all duration-300 dark:ring-1 dark:ring-primary/10"
      aria-label={`${venue.name} - ${venue.category} in ${venue.neighborhood}`}
    >
      {/* Image Header with Gradient Overlay - Always visible */}
      <div className="relative h-28 sm:h-36 md:h-44 bg-gradient-to-br from-primary/30 via-accent/20 to-secondary/30 overflow-hidden">
        {venue.imageUrl && (
          <OptimizedImage
            src={venue.imageUrl} 
            alt={venue.name}
            className="absolute inset-0 w-full h-full object-cover"
            responsive={true}
            responsiveSizes={['small', 'medium', 'large']}
            sizesConfig={{ mobile: '100vw', tablet: '640px', desktop: '800px' }}
            quality={85}
            aspectRatio="16/9"
            deferLoad={true}
            blurUp={true}
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background/70 via-transparent to-transparent" />
        
        {/* Close Button - Top right corner */}
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-2.5 right-2.5 sm:top-3 sm:right-3 z-20 bg-background/80 backdrop-blur-sm p-1.5 sm:p-2 rounded-full hover:bg-background transition-colors touch-manipulation"
            aria-label="Close"
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5 text-foreground" />
          </button>
        )}
        
        {/* Activity Badge - Top left */}
        <div className="absolute top-2.5 left-2.5 sm:top-3 sm:left-3 bg-background/80 backdrop-blur-sm px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-full flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-primary rounded-full animate-pulse" />
          <span className="text-[10px] sm:text-xs font-bold text-foreground">{venue.activity}% Active</span>
        </div>

        {/* Category Badge - Bottom left */}
        <div className="absolute bottom-2.5 left-2.5 sm:bottom-3 sm:left-3 bg-muted/80 backdrop-blur-sm px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-full">
          <span className="text-[10px] sm:text-xs font-semibold text-foreground">{venue.category}</span>
        </div>
      </div>

      {/* Content Area */}
      <div className="p-3 sm:p-4 md:p-5 space-y-3 sm:space-y-4">
        {/* Title */}
        <div>
          <h3 className="text-lg sm:text-xl md:text-2xl font-bold text-foreground mb-1 sm:mb-1.5">{venue.name}</h3>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <MapPin className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
              <span className="text-xs sm:text-sm">{venue.neighborhood}</span>
            </div>
            {venue.address && (
              <p className="text-[10px] sm:text-xs text-muted-foreground/80 pl-5 sm:pl-5.5 line-clamp-1">{venue.address}</p>
            )}
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
          <div className="bg-muted/50 rounded-lg sm:rounded-xl p-2 sm:p-3 text-center">
            <TrendingUp className={`w-4 h-4 sm:w-5 sm:h-5 mx-auto mb-0.5 sm:mb-1 ${activityLevel.color}`} />
            <p className="text-[9px] sm:text-[10px] text-muted-foreground">Status</p>
            <p className="text-xs sm:text-sm font-bold text-foreground">{activityLevel.label.split(" ")[1]}</p>
          </div>
          
          <div className="bg-muted/50 rounded-lg sm:rounded-xl p-2 sm:p-3 text-center">
            <Star className="w-4 h-4 sm:w-5 sm:h-5 mx-auto mb-0.5 sm:mb-1 text-warm" />
            <p className="text-[9px] sm:text-[10px] text-muted-foreground">Rating</p>
            <p className="text-xs sm:text-sm font-bold text-foreground">4.5</p>
          </div>
          
          <div className="bg-muted/50 rounded-lg sm:rounded-xl p-2 sm:p-3 text-center">
            <Users className="w-4 h-4 sm:w-5 sm:h-5 mx-auto mb-0.5 sm:mb-1 text-secondary" />
            <p className="text-[9px] sm:text-[10px] text-muted-foreground">Crowd</p>
            <p className="text-xs sm:text-sm font-bold text-foreground">{Math.round(venue.activity / 10) * 10}+</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-2 sm:gap-3" role="group" aria-label="Venue actions">
          <Button 
            onClick={handleShare}
            variant="outline"
            className="w-full border-border/60 hover:border-primary/60 hover:bg-primary/5 font-semibold h-10 sm:h-12 text-xs sm:text-sm rounded-lg sm:rounded-xl transition-all duration-300 focus-visible:ring-2 focus-visible:ring-primary"
            aria-label={`Share ${venue.name}`}
          >
            <Share2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5" aria-hidden="true" />
            Share
          </Button>
          <Button 
            onClick={handleGetDirections}
            className="w-full bg-gradient-to-r from-primary to-primary-glow hover:opacity-90 text-primary-foreground font-semibold h-10 sm:h-12 text-xs sm:text-sm rounded-lg sm:rounded-xl shadow-[var(--shadow-glow)] transition-all duration-300 focus-visible:ring-2 focus-visible:ring-primary"
            aria-label={`Get directions to ${venue.name}`}
          >
            Get Directions
          </Button>
        </div>
      </div>

      <UpgradePrompt
        requiredTier="jet_plus"
        featureName="Venue sharing"
        isOpen={showUpgradePrompt}
        onClose={() => setShowUpgradePrompt(false)}
      />
    </article>
  );
});
