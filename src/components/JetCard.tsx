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
      className="relative w-full rounded-2xl overflow-hidden transition-all duration-300"
      style={{
        backgroundColor: 'hsl(240 4% 22%)',
        border: '2px solid hsl(24 100% 60% / 0.6)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.7), 0 0 0 1px hsl(24 100% 60% / 0.25), 0 0 24px hsl(24 100% 60% / 0.15)',
        borderRadius: '16px',
        maxHeight: '320px',
        overflow: 'hidden',
      }}
      aria-label={`${venue.name} - ${venue.category} in ${venue.neighborhood}`}
    >
      {/* Compact Header */}
      <div className="relative h-20 sm:h-28 bg-gradient-to-br from-primary/30 via-accent/20 to-secondary/30 overflow-hidden">
        {venue.imageUrl && (
          <OptimizedImage
            src={venue.imageUrl} 
            alt={venue.name}
            className="absolute inset-0 w-full h-full object-cover"
            responsive={true}
            responsiveSizes={['small', 'medium']}
            sizesConfig={{ mobile: '100vw', tablet: '480px', desktop: '480px' }}
            quality={80}
            aspectRatio="16/9"
            deferLoad={true}
            blurUp={true}
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent" />
        
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-2 right-2 z-20 bg-background/80 backdrop-blur-sm p-1.5 rounded-full hover:bg-background transition-colors touch-manipulation"
            aria-label="Close"
          >
            <X className="w-4 h-4 text-foreground" />
          </button>
        )}
        
        {/* Activity Badge */}
        <div className="absolute top-2 left-2 bg-background/80 backdrop-blur-sm px-2 py-0.5 rounded-full flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
          <span className="text-[10px] font-bold text-foreground">{venue.activity}% Active</span>
        </div>

        {/* Category Badge */}
        <div className="absolute bottom-2 left-2 bg-muted/80 backdrop-blur-sm px-2 py-0.5 rounded-full">
          <span className="text-[10px] font-semibold text-foreground">{venue.category}</span>
        </div>
      </div>

      {/* Content Area - Compact */}
      <div className="p-3 space-y-2">
        {/* Title + Location */}
        <div>
          <h3 className="text-base sm:text-lg font-bold text-foreground leading-tight">{venue.name}</h3>
          <div className="flex items-center gap-1.5 text-muted-foreground mt-0.5">
            <MapPin className="w-3 h-3 flex-shrink-0" />
            <span className="text-[11px]">{venue.neighborhood}</span>
            {venue.address && (
              <span className="text-[10px] text-muted-foreground/70 truncate">· {venue.address}</span>
            )}
          </div>
        </div>

        {/* Inline Stats */}
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1">
            <TrendingUp className={`w-3.5 h-3.5 ${activityLevel.color}`} />
            <span className="font-semibold text-foreground">{activityLevel.label.split(" ")[1]}</span>
          </div>
          <div className="flex items-center gap-1">
            <Star className="w-3.5 h-3.5 text-warm" />
            <span className="font-semibold text-foreground">4.5</span>
          </div>
          <div className="flex items-center gap-1">
            <Users className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="font-semibold text-foreground">{Math.round(venue.activity / 10) * 10}+</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Venue actions">
          <Button 
            onClick={handleShare}
            variant="outline"
            className="w-full border-border/60 hover:border-primary/60 hover:bg-primary/5 font-semibold h-9 text-xs rounded-lg transition-all duration-300 focus-visible:ring-2 focus-visible:ring-primary"
            aria-label={`Share ${venue.name}`}
          >
            <Share2 className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
            Share
          </Button>
          <Button 
            onClick={handleGetDirections}
            className="w-full bg-gradient-to-r from-primary to-primary-glow hover:opacity-90 text-primary-foreground font-semibold h-9 text-xs rounded-lg shadow-[var(--shadow-glow)] transition-all duration-300 focus-visible:ring-2 focus-visible:ring-primary"
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
