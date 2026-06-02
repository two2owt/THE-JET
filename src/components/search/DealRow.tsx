import { memo, useCallback } from "react";
import { MapPin, Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Database } from "@/integrations/supabase/types";

type Deal = Database["public"]["Tables"]["deals"]["Row"];

interface DealRowProps {
  deal: Deal;
  onSelect: (deal: Deal) => void;
}

function DealRowImpl({ deal, onSelect }: DealRowProps) {
  const handleClick = useCallback(() => onSelect(deal), [deal, onSelect]);
  return (
    <button
      type="button"
      onClick={handleClick}
      className="w-full text-left p-2.5 rounded-xl hover:bg-primary/5 focus-visible:outline-none focus-visible:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors group"
    >
      <h5 className="font-semibold text-sm text-foreground truncate group-hover:text-primary transition-colors">
        {deal.title}
      </h5>
      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-snug">
        {deal.description}
      </p>
      <div className="flex items-center gap-1.5 mt-1.5 min-w-0">
        <Badge
          variant="outline"
          className="text-[10px] px-1.5 py-0 h-4 font-semibold flex-shrink-0"
        >
          <Tag className="w-2.5 h-2.5 mr-0.5" />
          {deal.deal_type}
        </Badge>
        <span className="text-[11px] text-muted-foreground flex items-center gap-0.5 min-w-0 truncate">
          <MapPin className="w-3 h-3 flex-shrink-0" />
          <span className="truncate">{deal.venue_name}</span>
        </span>
      </div>
    </button>
  );
}

export const DealRow = memo(DealRowImpl);