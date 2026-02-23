import { MapPin, Tag, Clock, X } from "lucide-react";
import { Card, CardContent } from "./ui/card";
import { Badge } from "./ui/badge";
import type { Venue } from "./MapboxHeatmap";
import type { Database } from "@/integrations/supabase/types";

type Deal = Database['public']['Tables']['deals']['Row'];

interface SearchResultsProps {
  query: string;
  venues: Venue[];
  deals: Deal[];
  onVenueSelect: (venue: Venue) => void;
  onClose: () => void;
  isVisible: boolean;
}

export const SearchResults = ({ 
  query, 
  venues, 
  deals, 
  onVenueSelect, 
  onClose,
  isVisible 
}: SearchResultsProps) => {
  if (!isVisible || !query.trim()) return null;

  // Filter venues by name, category, or neighborhood
  const filteredVenues = venues.filter(venue => 
    venue.name.toLowerCase().includes(query.toLowerCase()) ||
    venue.category.toLowerCase().includes(query.toLowerCase()) ||
    venue.neighborhood.toLowerCase().includes(query.toLowerCase())
  );

  // Filter deals by title, description, or venue name
  const filteredDeals = deals.filter(deal =>
    deal.title.toLowerCase().includes(query.toLowerCase()) ||
    deal.description.toLowerCase().includes(query.toLowerCase()) ||
    deal.venue_name.toLowerCase().includes(query.toLowerCase()) ||
    deal.deal_type.toLowerCase().includes(query.toLowerCase())
  );

  const hasResults = filteredVenues.length > 0 || filteredDeals.length > 0;

  return (
    <>
      <div className="fixed sm:absolute top-[60px] sm:top-full left-2 right-2 sm:left-auto sm:right-0 mt-0 sm:mt-2 z-[70] animate-fade-in sm:min-w-[320px] sm:max-w-[400px]">
        <Card className="max-h-[60vh] sm:max-h-[70vh] overflow-y-auto shadow-glow w-full bg-card/95 backdrop-blur-xl border-primary/20">
        <CardContent className="p-4 space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between sticky top-0 bg-card pb-2 border-b border-border">
            <h3 className="font-semibold text-foreground text-sm sm:text-base">
              Results for "{query}"
            </h3>
            <button 
              onClick={onClose}
              className="w-10 h-10 sm:w-8 sm:h-8 -mr-2 sm:mr-0 rounded-full bg-secondary/50 hover:bg-secondary flex items-center justify-center transition-all active:scale-95"
              aria-label="Close search results"
            >
              <X className="w-5 h-5 sm:w-4 sm:h-4 text-foreground" />
            </button>
          </div>

          {!hasResults && (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No results found</p>
              <p className="text-sm text-muted-foreground/70 mt-1">
                Try searching for venue names, categories, or deals
              </p>
            </div>
          )}

          {/* Venues Section */}
          {filteredVenues.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Venues ({filteredVenues.length})
              </h4>
              <div className="space-y-2">
                {filteredVenues.map((venue) => (
                  <button
                    key={venue.id}
                    onClick={() => {
                      onVenueSelect(venue);
                      onClose();
                    }}
                    className="w-full text-left p-3 rounded-xl hover:bg-secondary/50 transition-all group"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <h5 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                          {venue.name}
                        </h5>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-xs">
                            {venue.category}
                          </Badge>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {venue.neighborhood}
                          </span>
                        </div>
                      </div>
                      <div className="flex-shrink-0">
                        <div className={`w-2 h-2 rounded-full ${
                          venue.activity >= 80 ? 'bg-sunset-orange' :
                          venue.activity >= 60 ? 'bg-warm' :
                          venue.activity >= 40 ? 'bg-sunset-pink' : 'bg-cool'
                        }`} />
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Deals Section */}
          {filteredDeals.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Deals ({filteredDeals.length})
              </h4>
              <div className="space-y-2">
                {filteredDeals.map((deal) => (
                  <div
                    key={deal.id}
                    className="p-3 rounded-xl hover:bg-secondary/50 transition-all"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <h5 className="font-semibold text-foreground">
                          {deal.title}
                        </h5>
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {deal.description}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="outline" className="text-xs">
                            <Tag className="w-3 h-3 mr-1" />
                            {deal.deal_type}
                          </Badge>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {deal.venue_name}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      </div>
    </>
  );
};
