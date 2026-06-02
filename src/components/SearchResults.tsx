import { Store, Sparkles } from "lucide-react";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Card, CardContent } from "./ui/card";
import type { Venue } from "@/types/venue";
import type { Database } from "@/integrations/supabase/types";
import { useSearchFilter } from "@/hooks/useSearchFilter";
import { ResultsHeader } from "./search/ResultsHeader";
import { VenueRow } from "./search/VenueRow";
import { DealRow } from "./search/DealRow";
import { EmptyResults } from "./search/EmptyResults";

type Deal = Database["public"]["Tables"]["deals"]["Row"];

interface SearchResultsProps {
  query: string;
  venues: Venue[];
  deals: Deal[];
  onVenueSelect: (venue: Venue) => void;
  onClose: () => void;
  isVisible: boolean;
  /** Optional override; default opens `/?deal=<id>` via deep link. */
  onDealSelect?: (deal: Deal) => void;
}

/**
 * Search results panel — composes a header, venue rows, and deal rows.
 * Filtering + debouncing lives in `useSearchFilter` so this component is
 * purely presentation + glue. Children are memoized so a keystroke that
 * doesn't change a row's props skips its re-render.
 */
export const SearchResults = ({
  query,
  venues,
  deals,
  onVenueSelect,
  onClose,
  isVisible,
  onDealSelect,
}: SearchResultsProps) => {
  const navigate = useNavigate();

  // Position version — bumped whenever we should recalc (resize, orientation,
  // other floating UI). Used as a key on the panel so layout-affecting CSS
  // variables are re-read.
  const [posVersion, setPosVersion] = useState(0);

  useEffect(() => {
    if (!isVisible) return;
    const recalc = () => setPosVersion((v) => v + 1);
    window.addEventListener("resize", recalc);
    window.addEventListener("orientationchange", recalc);
    window.addEventListener("jet:floating-ui-toggle", recalc);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", recalc);
    return () => {
      window.removeEventListener("resize", recalc);
      window.removeEventListener("orientationchange", recalc);
      window.removeEventListener("jet:floating-ui-toggle", recalc);
      vv?.removeEventListener("resize", recalc);
    };
  }, [isVisible]);

  const {
    venues: filteredVenues,
    deals: filteredDeals,
    totalCount,
    debouncedQuery,
  } = useSearchFilter(query, venues, deals);

  const handleVenueSelect = useCallback(
    (venue: Venue) => {
      onVenueSelect(venue);
      onClose();
    },
    [onVenueSelect, onClose],
  );

  const handleDealSelect = useCallback(
    (deal: Deal) => {
      if (onDealSelect) {
        onDealSelect(deal);
      } else {
        navigate(`/?deal=${deal.id}`);
      }
      onClose();
    },
    [onDealSelect, navigate, onClose],
  );

  if (!isVisible || !query.trim()) return null;
  if (typeof document === "undefined") return null;

  const hasResults = totalCount > 0;

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
          top: "calc(var(--header-height, 56px) + env(safe-area-inset-top, 0px) + 8px)",
          maxHeight:
            "calc(100dvh - var(--header-height, 56px) - var(--bottom-nav-total-height, 80px) - env(safe-area-inset-top, 0px) - 24px)",
        }}
      >
        <Card className="flex flex-col h-full max-h-full overflow-hidden shadow-glow w-full bg-card/95 backdrop-blur-xl border-primary/20 rounded-2xl">
          <ResultsHeader
            query={debouncedQuery || query}
            totalCount={totalCount}
            onClose={onClose}
          />

          <CardContent className="p-3 sm:p-4 space-y-4 overflow-y-auto overscroll-contain flex-1 min-h-0">
            {!hasResults && <EmptyResults />}

            {filteredVenues.length > 0 && (
              <section className="space-y-1.5">
                <h4 className="flex items-center gap-1.5 heading-luxe-eyebrow px-1">
                  <Store className="w-3 h-3" />
                  Venues
                  <span className="ml-auto text-muted-foreground/60 tabular-nums">
                    {filteredVenues.length}
                  </span>
                </h4>
                <div className="space-y-1">
                  {filteredVenues.map((venue) => (
                    <VenueRow
                      key={venue.id}
                      venue={venue}
                      onSelect={handleVenueSelect}
                    />
                  ))}
                </div>
              </section>
            )}

            {filteredDeals.length > 0 && (
              <section className="space-y-1.5">
                <h4 className="flex items-center gap-1.5 heading-luxe-eyebrow px-1">
                  <Sparkles className="w-3 h-3" />
                  Deals
                  <span className="ml-auto text-muted-foreground/60 tabular-nums">
                    {filteredDeals.length}
                  </span>
                </h4>
                <div className="space-y-1">
                  {filteredDeals.map((deal) => (
                    <DealRow
                      key={deal.id}
                      deal={deal}
                      onSelect={handleDealSelect}
                    />
                  ))}
                </div>
              </section>
            )}
          </CardContent>
        </Card>
      </div>
    </>,
    document.body,
  );
};
