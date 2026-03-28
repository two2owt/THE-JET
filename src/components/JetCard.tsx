import { memo, useState, useEffect } from "react";
import { MapPin, Users, Star, TrendingUp, X, Share2 } from "lucide-react";
import { Button } from "./ui/button";
import { glideHaptic } from "@/lib/haptics";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Venue } from "./MapboxHeatmap";
import { UpgradePrompt, useFeatureAccess } from "./UpgradePrompt";
import { shareVenue } from "@/utils/shareUtils";
import { cn } from "@/lib/utils";

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
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const getActivityLevel = (activity: number) => {
    if (activity >= 80) return { label: "🔥 Very Busy", colorClass: "text-hot" };
    if (activity >= 60) return { label: "🌟 Busy", colorClass: "text-warm" };
    if (activity >= 40) return { label: "✨ Moderate", colorClass: "text-cool" };
    return { label: "😌 Quiet", colorClass: "text-cold" };
  };

  const handleGetDirections = async () => {
    await glideHaptic();
    onGetDirections();
  };

  const handleShare = async () => {
    if (!canAccessSocialFeatures()) {
      setShowUpgradePrompt(true);
      return;
    }
    await glideHaptic();
    const result = await shareVenue({ id: venue.id, name: venue.name });
    if (result.success) {
      if (result.method === "native") {
        toast.success("Shared successfully!", { description: `${venue.name} shared with others` });
      } else {
        toast.success("Copied to clipboard!", { description: "Share link copied - paste it anywhere" });
      }
    } else if (result.method !== "native") {
      toast.error("Couldn't share", { description: "Please try again" });
    }
  };

  const activityLevel = getActivityLevel(venue.activity);

  return (
    <article
      className="relative w-full bg-card border-2 border-primary/40 dark:border-primary/60 rounded-2xl overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.15)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.7),0_0_24px_hsl(var(--primary)/0.15)] max-h-[300px] font-sans"
      aria-label={`${venue.name} - ${venue.category} in ${venue.neighborhood}`}
    >
      {/* Image Header */}
      <div className="relative h-20 bg-gradient-to-br from-primary/30 to-accent/20 overflow-hidden">
        {venue.imageUrl && (
          <img
            src={venue.imageUrl}
            alt={venue.name}
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 dark:from-black/60 to-transparent" />

        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-2 right-2 z-20 bg-background/80 dark:bg-black/60 backdrop-blur-md border-none rounded-full p-1.5 cursor-pointer flex items-center justify-center"
            aria-label="Close"
          >
            <X className="w-4 h-4 text-foreground" />
          </button>
        )}

        {/* Activity Badge */}
        <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded-full flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 bg-primary rounded-full" />
          <span className="text-[10px] font-bold text-white">{venue.activity}% Active</span>
        </div>

        {/* Category Badge */}
        <div className="absolute bottom-2 left-2 bg-white/15 backdrop-blur-md px-2 py-0.5 rounded-full">
          <span className="text-[10px] font-semibold text-white">{venue.category}</span>
        </div>
      </div>

      {/* Content */}
      <div className="p-3 flex flex-col gap-2">
        {/* Title */}
        <div>
          <h3 className="text-base font-bold text-foreground leading-tight">{venue.name}</h3>
          <div className="flex items-center gap-1.5 mt-1 text-muted-foreground text-[11px]">
            <MapPin className="w-3 h-3 flex-shrink-0" />
            <span>{venue.neighborhood}</span>
            {venue.address && <span className="text-muted-foreground/60 overflow-hidden text-ellipsis whitespace-nowrap">· {venue.address}</span>}
          </div>
        </div>

        {/* Inline Stats */}
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1">
            <TrendingUp className={cn("w-3.5 h-3.5", activityLevel.colorClass)} />
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

        {/* Buttons */}
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Venue actions">
          <Button
            onClick={handleShare}
            variant="outline"
            className="w-full font-semibold h-9 text-xs rounded-lg"
            aria-label={`Share ${venue.name}`}
          >
            <Share2 className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
            Share
          </Button>
          <Button
            onClick={handleGetDirections}
            className="w-full bg-gradient-to-r from-primary to-primary-glow hover:opacity-90 text-primary-foreground font-semibold h-9 text-xs rounded-lg"
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
