import { MapPin, Tag, X, Search as SearchIcon, Store, Sparkles, Compass, LayoutGrid, Star, ImageIcon } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
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

/** Lightweight relevance score: 3 = exact, 2 = prefix, 1 = substring, 0 = no match. */
const matchScore = (haystack: string | null | undefined, q: string): number => {
  if (!haystack) return 0;
  const h = haystack.toLowerCase();
  if (h === q) return 3;
  if (h.startsWith(q)) return 2;
  if (h.includes(q)) return 1;
  return 0;
};

const MAX_PER_SECTION = 6;

export const SearchResults = ({
  query,
  venues,
  deals,
  onVenueSelect,
  onClose,
  isVisible,
}: SearchResultsProps) => {
  const navigate = useNavigate();
  // Position version — bumped whenever we should recalc (resize, orientation, dropdown open/close).
  // Used as a key on the panel so layout-affecting CSS variables are re-read.
  const [posVersion, setPosVersion] = useState(0);
  const panelRef = useRef<HTMLDivElement | null>(null);

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

  // Desktop click-outside dismiss. Mobile already has a tap-through backdrop.
  // We exclude the header search input itself so typing/focusing the pill
  // doesn't close the panel that just opened.
  useEffect(() => {
    if (!isVisible) return;
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      const headerEl = document.querySelector('header[role="banner"]');
      if (headerEl?.contains(target)) return;
      onClose();
    };
    // Use pointerdown so we beat focus/blur races on touch + mouse.
    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [isVisible, onClose]);

  const q = query.trim().toLowerCase();

  // Memoize result groups — all four sections derive from the same `venues` + `deals` props,
  // ranked by best-field match so the most relevant items float to the top of each section.
  const groups = useMemo(() => {
    if (!q) {
      return { venues: [], deals: [], areas: [], categories: [] };
    }

    // --- Venues (rank by best field match across name / category / neighborhood) ---
    const rankedVenues = venues
      .map((v) => ({
        venue: v,
        score: Math.max(
          matchScore(v.name, q) * 3, // name weighted highest
          matchScore(v.category, q) * 2,
          matchScore(v.neighborhood, q) * 2,
          matchScore(v.address ?? "", q),
        ),
      }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score || b.venue.activity - a.venue.activity);

    // --- Deals (rank across title / description / venue / type) ---
    const rankedDeals = deals
      .map((d) => ({
        deal: d,
        score: Math.max(
          matchScore(d.title, q) * 3,
          matchScore(d.venue_name, q) * 2,
          matchScore(d.deal_type, q) * 2,
          matchScore(d.description, q),
        ),
      }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score);

    // --- Areas (distinct neighborhoods from venues that match the query) ---
    const areaMap = new Map<string, { name: string; count: number; score: number }>();
    for (const v of venues) {
      const score = matchScore(v.neighborhood, q);
      if (!score) continue;
      const key = v.neighborhood.toLowerCase();
      const existing = areaMap.get(key);
      if (existing) existing.count += 1;
      else areaMap.set(key, { name: v.neighborhood, count: 1, score });
    }
    const areas = Array.from(areaMap.values()).sort(
      (a, b) => b.score - a.score || b.count - a.count,
    );

    // --- Categories (distinct venue categories + deal_types that match the query) ---
    const catMap = new Map<
      string,
      { name: string; count: number; score: number; source: "venue" | "deal" }
    >();
    for (const v of venues) {
      const score = matchScore(v.category, q);
      if (!score) continue;
      const key = v.category.toLowerCase();
      const existing = catMap.get(key);
      if (existing) existing.count += 1;
      else catMap.set(key, { name: v.category, count: 1, score, source: "venue" });
    }
    for (const d of deals) {
      const score = matchScore(d.deal_type, q);
      if (!score) continue;
      const key = d.deal_type.toLowerCase();
      const existing = catMap.get(key);
      if (existing) existing.count += 1;
      else catMap.set(key, { name: d.deal_type, count: 1, score, source: "deal" });
    }
    const categories = Array.from(catMap.values()).sort(
      (a, b) => b.score - a.score || b.count - a.count,
    );

    return { venues: rankedVenues, deals: rankedDeals, areas, categories };
  }, [q, venues, deals]);

  if (!isVisible || !q) return null;

  const filteredVenues = groups.venues.slice(0, MAX_PER_SECTION).map((r) => r.venue);
  const filteredDeals = groups.deals.slice(0, MAX_PER_SECTION).map((r) => r.deal);
  const filteredAreas = groups.areas.slice(0, MAX_PER_SECTION);
  const filteredCategories = groups.categories.slice(0, MAX_PER_SECTION);

  const totalCount =
    filteredVenues.length +
    filteredDeals.length +
    filteredAreas.length +
    filteredCategories.length;
  const hasResults = totalCount > 0;

  /** Pick the best venue in a neighborhood (sorted by activity), then select it on the map. */
  const handleAreaSelect = (areaName: string) => {
    const match = venues
      .filter((v) => v.neighborhood.toLowerCase() === areaName.toLowerCase())
      .sort((a, b) => b.activity - a.activity)[0];
    if (match) {
      onVenueSelect(match);
    }
    onClose();
  };

  /** Pick the most active venue in a category and select it. */
  const handleCategorySelect = (categoryName: string) => {
    const match = venues
      .filter((v) => v.category.toLowerCase() === categoryName.toLowerCase())
      .sort((a, b) => b.activity - a.activity)[0];
    if (match) {
      onVenueSelect(match);
    }
    onClose();
  };

  /** Open a deal via the app's existing ?deal= deep-link contract handled in Index.tsx. */
  const handleDealSelect = (deal: Deal) => {
    // Prefer surfacing the venue's JetCard (so users land on the same
    // surface they would from a venue/area/category selection). When the
    // deal's venue is loaded, select it — Index.tsx syncs `?venue=` into
    // the URL so the link stays shareable. Fall back to the `?deal=`
    // deep-link contract when the venue isn't in the current dataset.
    const venueMatch = deal.venue_id
      ? venues.find((v) => v.id === deal.venue_id)
      : venues.find(
          (v) => v.name.toLowerCase() === (deal.venue_name ?? "").toLowerCase(),
        );
    if (venueMatch) {
      onVenueSelect(venueMatch);
    } else {
      navigate(`/?deal=${deal.id}`);
    }
    onClose();
  };

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
        ref={panelRef}
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
                  Try a venue, area, category, or deal
                </p>
              </div>
            )}

            {/* Areas (neighborhoods) */}
            {filteredAreas.length > 0 && (
              <section className="space-y-1.5">
                <h4 className="flex items-center gap-1.5 heading-luxe-eyebrow px-1">
                  <Compass className="w-3 h-3" />
                  Areas
                  <span className="ml-auto text-muted-foreground/60 tabular-nums">{filteredAreas.length}</span>
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {filteredAreas.map((area) => (
                    <button
                      key={`area-${area.name}`}
                      onClick={() => handleAreaSelect(area.name)}
                      className="group inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-secondary/60 hover:bg-primary/10 hover:text-primary border border-border/60 hover:border-primary/40 text-xs font-semibold text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 active:scale-95"
                    >
                      <MapPin className="w-3 h-3" />
                      <span className="truncate max-w-[140px]">{area.name}</span>
                      <span className="text-[10px] font-medium text-muted-foreground tabular-nums group-hover:text-primary/80">
                        {area.count}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Categories (venue categories + deal types) */}
            {filteredCategories.length > 0 && (
              <section className="space-y-1.5">
                <h4 className="flex items-center gap-1.5 heading-luxe-eyebrow px-1">
                  <LayoutGrid className="w-3 h-3" />
                  Categories
                  <span className="ml-auto text-muted-foreground/60 tabular-nums">{filteredCategories.length}</span>
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {filteredCategories.map((cat) => (
                    <button
                      key={`cat-${cat.source}-${cat.name}`}
                      onClick={() => handleCategorySelect(cat.name)}
                      className="group inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-secondary/60 hover:bg-primary/10 hover:text-primary border border-border/60 hover:border-primary/40 text-xs font-semibold text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 active:scale-95"
                    >
                      <Tag className="w-3 h-3" />
                      <span className="truncate max-w-[160px]">{cat.name}</span>
                      <span className="text-[10px] font-medium text-muted-foreground tabular-nums group-hover:text-primary/80">
                        {cat.count}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Venues */}
            {filteredVenues.length > 0 && (
              <section className="space-y-1.5">
                <h4 className="flex items-center gap-1.5 heading-luxe-eyebrow px-1">
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
                <h4 className="flex items-center gap-1.5 heading-luxe-eyebrow px-1">
                  <Sparkles className="w-3 h-3" />
                  Deals
                  <span className="ml-auto text-muted-foreground/60 tabular-nums">{filteredDeals.length}</span>
                </h4>
                <div className="space-y-1">
                  {filteredDeals.map((deal) => (
                    <button
                      key={deal.id}
                      onClick={() => handleDealSelect(deal)}
                      className="w-full text-left p-2.5 rounded-xl hover:bg-primary/5 focus-visible:outline-none focus-visible:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors group"
                    >
                      <h5 className="font-semibold text-sm text-foreground truncate group-hover:text-primary transition-colors">
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
                    </button>
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
