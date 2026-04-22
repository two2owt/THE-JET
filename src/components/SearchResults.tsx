import { MapPin, Tag, X, Search as SearchIcon, Store, Sparkles } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
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
  // Position version — bumped whenever we should recalc (resize, orientation, dropdown open/close).
  // Used as a key on the panel so layout-affecting CSS variables are re-read.
  const [posVersion, setPosVersion] = useState(0);

  useEffect(() => {
    if (!isVisible) return;
    const recalc = () => setPosVersion(v => v + 1);

    window.addEventListener('resize', recalc);
    window.addEventListener('orientationchange', recalc);
    // Custom event dispatched by other floating UI (e.g. city dropdown) when it opens/closes
    window.addEventListener('jet:floating-ui-toggle', recalc);

    // VisualViewport handles iOS keyboard/zoom changes that affect safe-area insets
    const vv = window.visualViewport;
    vv?.addEventListener('resize', recalc);

    return () => {
      window.removeEventListener('resize', recalc);
      window.removeEventListener('orientationchange', recalc);
      window.removeEventListener('jet:floating-ui-toggle', recalc);
      vv?.removeEventListener('resize', recalc);
    };
  }, [isVisible]);

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
  const totalCount = filteredVenues.length + filteredDeals.length;

  if (typeof document === 'undefined') return null;

  return createPortal(
    <>
      {/* Mobile-only dimmed backdrop — keeps focus on results, dismisses on tap */}
      <button
        type="button"
        aria-label="Close search results"
        onClick={onClose}
        className="sm:hidden fixed inset-0 z-[9998] bg-background/40 backdrop-blur-[2px] animate-fade-in"
      />

      <div
        key={posVersion}
        role="dialog"
        aria-label="Search results"
        className="fixed left-2 right-2 sm:left-auto sm:right-4 z-[9999] animate-fade-in sm:w-[420px] sm:max-w-[min(420px,calc(100vw-2rem))]"
        style={{
          top: 'calc(var(--header-height, 56px) + env(safe-area-inset-top, 0px) + 8px)',
          // Stay clear of the bottom nav on mobile and the page edge on desktop
          maxHeight:
            'calc(100dvh - var(--header-height, 56px) - var(--bottom-nav-total-height, 80px) - env(safe-area-inset-top, 0px) - 24px)',
        }}
      >
        <Card className="flex flex-col h-full max-h-full overflow-hidden shadow-glow w-full bg-card/95 backdrop-blur-xl border-primary/20 rounded-2xl">
          {/* Sticky header */}
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border/60 bg-card/95 backdrop-blur-xl">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <SearchIcon className="w-3.5 h-3.5 text-primary" />
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-sm text-foreground truncate" style={{ letterSpacing: '-0.01em' }}>
                  “{query}”
                </h3>
                <p className="text-[11px] font-medium text-muted-foreground tabular-nums">
                  {totalCount} {totalCount === 1 ? 'result' : 'results'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close search results"
              className="w-9 h-9 rounded-full bg-secondary/60 hover:bg-primary/10 hover:text-primary text-foreground flex items-center justify-center transition-colors active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 flex-shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Scrollable body */}
          <CardContent className="p-3 sm:p-4 space-y-4 overflow-y-auto overscroll-contain flex-1 min-h-0">
            {!hasResults && (
              <div className="text-center py-10">
                <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-3">
                  <SearchIcon className="w-5 h-5 text-muted-foreground" />
                </div>
                <p className="text-sm font-semibold text-foreground">No results found</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Try a venue name, category, or deal type
                </p>
              </div>
            )}

            {/* Venues */}
            {filteredVenues.length > 0 && (
              <section className="space-y-1.5">
                <h4 className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground uppercase tracking-[0.08em] px-1">
                  <Store className="w-3 h-3" />
                  Venues
                  <span className="ml-auto text-muted-foreground/60 tabular-nums">{filteredVenues.length}</span>
                </h4>
                <div className="space-y-1">
                  {filteredVenues.map((venue) => (
                    <button
                      key={venue.id}
                      onClick={() => {
                        onVenueSelect(venue);
                        onClose();
                      }}
                      className="w-full text-left p-2.5 rounded-xl hover:bg-primary/5 focus-visible:outline-none focus-visible:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex-1 min-w-0">
                          <h5 className="font-semibold text-sm text-foreground truncate group-hover:text-primary transition-colors">
                            {venue.name}
                          </h5>
                          <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-semibold flex-shrink-0">
                              {venue.category}
                            </Badge>
                            <span className="text-[11px] text-muted-foreground flex items-center gap-0.5 min-w-0 truncate">
                              <MapPin className="w-3 h-3 flex-shrink-0" />
                              <span className="truncate">{venue.neighborhood}</span>
                            </span>
                          </div>
                        </div>
                        <div
                          className={`w-2 h-2 rounded-full flex-shrink-0 ${
                            venue.activity >= 80 ? 'bg-sunset-orange' :
                            venue.activity >= 60 ? 'bg-warm' :
                            venue.activity >= 40 ? 'bg-sunset-pink' : 'bg-cool'
                          }`}
                          aria-label={`Activity ${venue.activity}`}
                        />
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Deals */}
            {filteredDeals.length > 0 && (
              <section className="space-y-1.5">
                <h4 className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground uppercase tracking-[0.08em] px-1">
                  <Sparkles className="w-3 h-3" />
                  Deals
                  <span className="ml-auto text-muted-foreground/60 tabular-nums">{filteredDeals.length}</span>
                </h4>
                <div className="space-y-1">
                  {filteredDeals.map((deal) => (
                    <div
                      key={deal.id}
                      className="p-2.5 rounded-xl hover:bg-primary/5 transition-colors"
                    >
                      <h5 className="font-semibold text-sm text-foreground truncate">
                        {deal.title}
                      </h5>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-snug">
                        {deal.description}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1.5 min-w-0">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-semibold flex-shrink-0">
                          <Tag className="w-2.5 h-2.5 mr-0.5" />
                          {deal.deal_type}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground flex items-center gap-0.5 min-w-0 truncate">
                          <MapPin className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">{deal.venue_name}</span>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </CardContent>
        </Card>
      </div>
    </>,
    document.body
  );
};
