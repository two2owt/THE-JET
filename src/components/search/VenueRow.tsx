import { memo, useCallback } from "react";
import { MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Venue } from "@/types/venue";

interface VenueRowProps {
  venue: Venue;
  onSelect: (venue: Venue) => void;
}

function activityColor(activity: number): string {
  if (activity >= 80) return "bg-sunset-orange";
  if (activity >= 60) return "bg-warm";
  if (activity >= 40) return "bg-sunset-pink";
  return "bg-cool";
}

function VenueRowImpl({ venue, onSelect }: VenueRowProps) {
  const handleClick = useCallback(() => onSelect(venue), [venue, onSelect]);
  return (
    <button
      onClick={handleClick}
      className="w-full text-left p-2.5 rounded-xl hover:bg-primary/5 focus-visible:outline-none focus-visible:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors group"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex-1 min-w-0">
          <h5 className="font-semibold text-sm text-foreground truncate group-hover:text-primary transition-colors">
            {venue.name}
          </h5>
          <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0 h-4 font-semibold flex-shrink-0"
            >
              {venue.category}
            </Badge>
            <span className="text-[11px] text-muted-foreground flex items-center gap-0.5 min-w-0 truncate">
              <MapPin className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{venue.neighborhood}</span>
            </span>
          </div>
        </div>
        <div
          className={`w-2 h-2 rounded-full flex-shrink-0 ${activityColor(venue.activity)}`}
          aria-label={`Activity ${venue.activity}`}
        />
      </div>
    </button>
  );
}

export const VenueRow = memo(VenueRowImpl);