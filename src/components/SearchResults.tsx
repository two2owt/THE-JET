import {
  MapPin,
  Tag,
  X,
  Search as SearchIcon,
  Store,
  Sparkles,
  Compass,
  LayoutGrid,
  Star,
} from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@/lib/router-compat";
import { Card, CardContent } from "./ui/card";
import { Badge } from "./ui/badge";
import type { Venue } from "./MapboxHeatmap";
import type { Database } from "@/integrations/supabase/types";
import { useLockMapWhileInteracting } from "@/lib/mapInteractionLock";
import { activityTier } from "@/lib/activity-palette";
import { categoryIconFor } from "@/lib/category-icon";

type Deal = Database["public"]["Tables"]["deals"]["Row"];

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

/** Duration (ms) of the panel open/close transition — keep in sync with the CSS below. */
const TRANSITION_MS = 190;

/** useLayoutEffect on the client, useEffect during SSR (avoids the hydration warning). */
const useIsoLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** Small square thumbnail; falls back to the venue category's icon. */
const ResultThumb = ({
  src,
  alt,
  category,
}: {
  src?: string | null;
  alt: string;
  category?: string | null;
}) => {
  const [failed, setFailed] = useState(false);
  const { Icon, accent } = categoryIconFor(category);
  return (
    <div
      className="w-12 h-12 rounded-lg flex-shrink-0 overflow-hidden flex items-center justify-center"
      style={
        src && !failed
          ? undefined
          : {
              background: `linear-gradient(150deg, ${accent}22, ${accent}0D)`,
              border: `1px solid ${accent}33`,
            }
      }
    >
      {src && !failed ? (
        <img
          src={src}
          alt={alt}
          className="w-full h-full object-cover"
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <Icon
          className="w-5 h-5"
          style={{ color: accent }}
          aria-hidden="true"
        />
      )}
    </div>
  );
};

export const SearchResults = ({
  query,
  venues,
  deals,
  onVenueSelect,
  onClose,
  isVisible,
}: SearchResultsProps) => {
  const navigate = useNavigate();
  // Measured layout box (in px) so the panel never relies on dvh/env() support
  // being correct on a given browser. Recomputed on resize, orientation change,
  // visual-viewport changes (iOS keyboard/zoom) and header/nav size changes.
  const [box, setBox] = useState<{
    top: number;
    bottom: number;
    maxHeight: number;
  } | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  // Element state (not just the ref) so the lock re-binds when the panel remounts.
  const [panelEl, setPanelEl] = useState<HTMLDivElement | null>(null);
  useLockMapWhileInteracting(panelEl, isVisible);

  const q = query.trim().toLowerCase();
  const shouldShow = isVisible && q.length > 0;

  // Keep the panel mounted through its closing transition, and only flip the
  // "entered" flag on the frame after mount so the browser has a start value
  // to animate from (no first-frame jump).
  const [mounted, setMounted] = useState(shouldShow);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (shouldShow) {
      setMounted(true);
      let inner = 0;
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => setEntered(true));
      });
      return () => {
        cancelAnimationFrame(outer);
        cancelAnimationFrame(inner);
      };
    }
    setEntered(false);
    const t = window.setTimeout(() => setMounted(false), TRANSITION_MS);
    return () => window.clearTimeout(t);
  }, [shouldShow]);

  useIsoLayoutEffect(() => {
    if (!isVisible || typeof window === "undefined") return;

    let frame = 0;
    const measure = () => {
      const vv = window.visualViewport;
      // Visual viewport height is the only value that shrinks with the iOS
      // keyboard; fall back to layout viewport elsewhere.
      const viewportH = vv?.height ?? window.innerHeight;
      // Offset of the visual viewport within the layout viewport (iOS zoom/scroll).
      const vvTop = vv?.offsetTop ?? 0;

      const headerEl = document.querySelector('header[role="banner"]');
      const headerRect = headerEl?.getBoundingClientRect();
      const headerBottom = headerRect ? Math.max(0, headerRect.bottom) : 56;

      const navEl = document.querySelector('nav[aria-label="Main navigation"]');
      const navRect = navEl?.getBoundingClientRect();
      // Actual nav height including its safe-area padding, measured live.
      const navHeight = navRect
        ? Math.max(0, viewportH + vvTop - navRect.top)
        : 0;

      // Clear the header's hairline divider and any focus ring on the search
      // pill, so the panel never visually touches or covers the header.
      const GAP_TOP = 12;
      const GAP_BOTTOM = 12;
      // Round to whole pixels: sub-pixel churn from rubber-band scrolling or
      // safe-area settling would otherwise re-render the panel every frame.
      // Hard floor at the measured header bottom: even if a measurement is
      // stale mid-transition, the panel can never render over the header.
      const top = Math.round(Math.max(headerBottom + GAP_TOP, GAP_TOP));
      const bottom = Math.round(navHeight + GAP_BOTTOM);
      const available = Math.max(160, viewportH - top - bottom);
      // Keep the map visible around the panel on tall screens, but never
      // exceed the space actually left between header and footer nav.
      const maxHeight = Math.round(
        Math.min(available, Math.max(240, viewportH * 0.52), 480),
      );

      setBox((prev) =>
        prev &&
        prev.top === top &&
        prev.bottom === bottom &&
        prev.maxHeight === maxHeight
          ? prev
          : { top, bottom, maxHeight },
      );
    };

    const recalc = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };

    measure();

    window.addEventListener("resize", recalc);
    window.addEventListener("orientationchange", recalc);
    window.addEventListener("scroll", recalc, { passive: true });
    // Custom event dispatched by other floating UI (e.g. city dropdown) when it opens/closes
    window.addEventListener("jet:floating-ui-toggle", recalc);

    // VisualViewport handles iOS keyboard/zoom changes that affect safe-area insets
    const vv = window.visualViewport;
    vv?.addEventListener("resize", recalc);
    vv?.addEventListener("scroll", recalc);

    // Header/footer can change height (search expands, safe areas settle).
    const ro =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(recalc) : null;
    const headerEl = document.querySelector('header[role="banner"]');
    const navEl = document.querySelector('nav[aria-label="Main navigation"]');
    if (headerEl) ro?.observe(headerEl);
    if (navEl) ro?.observe(navEl);

    // Orientation change on iOS reports stale sizes for a frame or two.
    const settle = window.setTimeout(measure, 250);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(settle);
      window.removeEventListener("resize", recalc);
      window.removeEventListener("orientationchange", recalc);
      window.removeEventListener("scroll", recalc);
      window.removeEventListener("jet:floating-ui-toggle", recalc);
      vv?.removeEventListener("resize", recalc);
      vv?.removeEventListener("scroll", recalc);
      ro?.disconnect();
    };
  }, [isVisible]);

  // Click/tap outside dismiss. We exclude both the results panel and the
  // header search wrapper so focusing the pill or interacting with results
  // keeps the panel open, while taps anywhere else close it.
  useEffect(() => {
    if (!isVisible) return;
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      const searchWrapper = document.querySelector("[data-jet-search-wrapper]");
      if (searchWrapper?.contains(target)) return;
      onClose();
    };
    // Use pointerdown so we beat focus/blur races on touch + mouse.
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [isVisible, onClose]);

  // Keyboard support: Escape dismisses, Arrow keys / Home / End walk the
  // result options, Tab out closes. Works whether focus is still in the
  // search input or already inside the panel.
  useEffect(() => {
    if (!isVisible) return;

    const options = (): HTMLElement[] =>
      Array.from(
        listRef.current?.querySelectorAll<HTMLElement>(
          '[data-search-option="true"]',
        ) ?? [],
      );

    const focusAt = (index: number) => {
      const items = options();
      if (items.length === 0) return;
      const next = (index + items.length) % items.length;
      const el = items[next];
      el.focus();
      el.scrollIntoView({ block: "nearest" });
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
      const active = document.activeElement as HTMLElement | null;
      const insidePanel = !!(active && panelRef.current?.contains(active));
      const inSearchInput =
        !!active &&
        active.tagName === "INPUT" &&
        active.getAttribute("aria-controls") === "jet-search-results";
      if (!insidePanel && !inSearchInput) return;

      const items = options();
      if (items.length === 0) return;
      e.preventDefault();
      const current = active ? items.indexOf(active) : -1;
      if (e.key === "Home") focusAt(0);
      else if (e.key === "End") focusAt(items.length - 1);
      else if (e.key === "ArrowDown") focusAt(current + 1);
      else focusAt(current <= 0 ? items.length - 1 : current - 1);
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isVisible, onClose]);

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
    const areaMap = new Map<
      string,
      { name: string; count: number; score: number }
    >();
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
      else
        catMap.set(key, { name: v.category, count: 1, score, source: "venue" });
    }
    for (const d of deals) {
      const score = matchScore(d.deal_type, q);
      if (!score) continue;
      const key = d.deal_type.toLowerCase();
      const existing = catMap.get(key);
      if (existing) existing.count += 1;
      else
        catMap.set(key, { name: d.deal_type, count: 1, score, source: "deal" });
    }
    const categories = Array.from(catMap.values()).sort(
      (a, b) => b.score - a.score || b.count - a.count,
    );

    // --- JetCards (venues + venues derived from matching deals) ---
    const jetcardsMap = new Map<string, { venue: Venue; score: number }>();
    for (const r of rankedVenues) {
      jetcardsMap.set(r.venue.id, { venue: r.venue, score: r.score });
    }
    for (const rd of rankedDeals) {
      const d = rd.deal;
      const venueMatch = d.venue_id
        ? venues.find((v) => v.id === d.venue_id)
        : venues.find(
            (v) => v.name.toLowerCase() === (d.venue_name ?? "").toLowerCase(),
          );
      if (venueMatch && !jetcardsMap.has(venueMatch.id)) {
        jetcardsMap.set(venueMatch.id, {
          venue: venueMatch,
          score: rd.score * 0.8,
        });
      }
    }
    const jetcards = Array.from(jetcardsMap.values())
      .sort((a, b) => b.score - a.score || b.venue.activity - a.venue.activity)
      .slice(0, MAX_PER_SECTION);

    return {
      venues: rankedVenues,
      deals: rankedDeals,
      areas,
      categories,
      jetcards,
    };
  }, [q, venues, deals]);

  // Freeze the last rendered query + results so the closing transition doesn't
  // flash an empty "no results" state when the input clears.
  const frozen = useRef({ query, groups });
  if (shouldShow) frozen.current = { query, groups };
  const displayQuery = shouldShow ? query : frozen.current.query;
  const displayGroups = shouldShow ? groups : frozen.current.groups;

  // Stay mounted while the closing transition plays out.
  if (!mounted) return null;

  const filteredVenues = displayGroups.venues
    .slice(0, MAX_PER_SECTION)
    .map((r) => r.venue);
  const filteredDeals = displayGroups.deals
    .slice(0, MAX_PER_SECTION)
    .map((r) => r.deal);
  const filteredAreas = displayGroups.areas.slice(0, MAX_PER_SECTION);
  const filteredCategories = displayGroups.categories.slice(0, MAX_PER_SECTION);
  const filteredJetcards = (displayGroups.jetcards ?? []).map((r) => r.venue);

  const totalCount =
    filteredJetcards.length +
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
  /** Fall back to the deal's venue photo when the deal has no image of its own. */
  const venueImageFor = (deal: Deal): string | undefined => {
    const match = deal.venue_id
      ? venues.find((v) => v.id === deal.venue_id)
      : venues.find(
          (v) => v.name.toLowerCase() === (deal.venue_name ?? "").toLowerCase(),
        );
    return match?.imageUrl;
  };

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

  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      <div
        ref={(node) => {
          panelRef.current = node;
          setPanelEl(node);
        }}
        id="jet-search-results"
        role="dialog"
        aria-label="Search results"
        aria-hidden={!entered}
        className={`fixed left-2 right-2 sm:left-auto sm:right-4 z-[9999] sm:w-[420px] sm:max-w-[min(420px,calc(100vw-2rem))] will-change-transform motion-reduce:transition-none ${
          entered
            ? "opacity-100 translate-y-0 scale-100"
            : "opacity-0 -translate-y-1 scale-[0.985] pointer-events-none"
        }`}
        style={{
          // Composited-only transition (opacity + transform) so opening and
          // closing never trigger layout. Position/height changes from a
          // resize are applied instantly to avoid lagging behind the viewport.
          transition: `opacity ${TRANSITION_MS}ms cubic-bezier(0.22, 1, 0.36, 1), transform ${TRANSITION_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`,
          transformOrigin: "top center",
          contain: "layout paint",
          // Measured values win; the CSS fallbacks only apply for the very
          // first paint before measurement lands.
          top: box
            ? `${box.top}px`
            : "calc(var(--header-height, 56px) + env(safe-area-inset-top, 0px) + 12px)",
          // Hard-anchor the bottom edge above the nav bar so the panel can
          // never sit under (or scroll behind) the footer navigation.
          bottom: box
            ? `${box.bottom}px`
            : "calc(var(--bottom-nav-total-height, 80px) + env(safe-area-inset-bottom, 0px) + 12px)",
          maxHeight: box
            ? `${box.maxHeight}px`
            : "min(calc(100dvh - var(--header-height, 56px) - var(--bottom-nav-total-height, 80px) - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 24px), 52dvh, 480px)",
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
                <h3
                  className="font-bold text-sm text-foreground truncate"
                  style={{ letterSpacing: "-0.01em" }}
                >
                  “{displayQuery}”
                </h3>
                <p
                  className="text-[11px] font-medium text-muted-foreground tabular-nums"
                  aria-live="polite"
                >
                  {totalCount} {totalCount === 1 ? "result" : "results"}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close search results"
              className="w-9 h-9 rounded-full bg-secondary/60 hover:bg-primary/10 hover:text-primary text-foreground flex items-center justify-center transition-colors active:scale-95 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/40 flex-shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Scrollable body */}
          <CardContent
            ref={listRef}
            className="p-3 sm:p-4 pb-4 space-y-4 overflow-y-auto overscroll-contain flex-1 min-h-0"
          >
            {!hasResults && (
              <div className="text-center py-10">
                <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-3">
                  <SearchIcon className="w-5 h-5 text-muted-foreground" />
                </div>
                <p className="text-sm font-semibold text-foreground">
                  No results found
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Try a venue, area, category, or deal
                </p>
              </div>
            )}

            {/* JetCards — venues + deal-backed venues for direct card access */}
            {filteredJetcards.length > 0 && (
              <section className="space-y-1.5">
                <h4 className="flex items-center gap-1.5 heading-luxe-eyebrow px-1">
                  <Store className="w-3 h-3" />
                  JetCards
                  <span className="ml-auto text-muted-foreground tabular-nums">
                    {filteredJetcards.length}
                  </span>
                </h4>
                <div className="space-y-1">
                  {filteredJetcards.map((venue) => (
                    <button
                      data-search-option="true"
                      key={venue.id}
                      onClick={() => {
                        onVenueSelect(venue);
                        onClose();
                      }}
                      className="w-full text-left p-2.5 rounded-xl hover:bg-primary/5 focus-visible:outline-hidden focus-visible:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <ResultThumb
                          src={venue.imageUrl}
                          alt={`${venue.name} photo`}
                          category={venue.category}
                        />
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
                              <span className="truncate">
                                {venue.neighborhood}
                              </span>
                            </span>
                          </div>
                          {(venue.googleRating != null ||
                            venue.googleTotalRatings != null) && (
                            <div className="flex items-center gap-1 mt-1">
                              {venue.googleRating != null && (
                                <span className="flex items-center gap-0.5 text-[11px] font-medium text-foreground">
                                  <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                                  {venue.googleRating.toFixed(1)}
                                </span>
                              )}
                              {venue.googleTotalRatings != null && (
                                <span className="text-[11px] text-muted-foreground">
                                  ({venue.googleTotalRatings.toLocaleString()})
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        <div
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{
                            background: activityTier(venue.activity).dark,
                          }}
                          aria-label={`Activity ${venue.activity} — ${activityTier(venue.activity).label}`}
                        />
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Areas (neighborhoods) */}
            {filteredAreas.length > 0 && (
              <section className="space-y-1.5">
                <h4 className="flex items-center gap-1.5 heading-luxe-eyebrow px-1">
                  <Compass className="w-3 h-3" />
                  Areas
                  <span className="ml-auto text-muted-foreground tabular-nums">
                    {filteredAreas.length}
                  </span>
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {filteredAreas.map((area) => (
                    <button
                      data-search-option="true"
                      key={`area-${area.name}`}
                      onClick={() => handleAreaSelect(area.name)}
                      className="group inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-secondary/60 hover:bg-primary/10 hover:text-primary border border-border/60 hover:border-primary/40 text-xs font-semibold text-foreground transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/40 active:scale-95"
                    >
                      <MapPin className="w-3 h-3" />
                      <span className="truncate max-w-[140px]">
                        {area.name}
                      </span>
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
                  <span className="ml-auto text-muted-foreground tabular-nums">
                    {filteredCategories.length}
                  </span>
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {filteredCategories.map((cat) => (
                    <button
                      data-search-option="true"
                      key={`cat-${cat.source}-${cat.name}`}
                      onClick={() => handleCategorySelect(cat.name)}
                      className="group inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-secondary/60 hover:bg-primary/10 hover:text-primary border border-border/60 hover:border-primary/40 text-xs font-semibold text-foreground transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/40 active:scale-95"
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
                  <span className="ml-auto text-muted-foreground tabular-nums">
                    {filteredVenues.length}
                  </span>
                </h4>
                <div className="space-y-1">
                  {filteredVenues.map((venue) => (
                    <button
                      data-search-option="true"
                      key={venue.id}
                      onClick={() => {
                        onVenueSelect(venue);
                        onClose();
                      }}
                      className="w-full text-left p-2.5 rounded-xl hover:bg-primary/5 focus-visible:outline-hidden focus-visible:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <ResultThumb
                          src={venue.imageUrl}
                          alt={`${venue.name} photo`}
                          category={venue.category}
                        />
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
                              <span className="truncate">
                                {venue.neighborhood}
                              </span>
                            </span>
                          </div>
                        </div>
                        <div
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{
                            background: activityTier(venue.activity).dark,
                          }}
                          aria-label={`Activity ${venue.activity} — ${activityTier(venue.activity).label}`}
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
                  <span className="ml-auto text-muted-foreground tabular-nums">
                    {filteredDeals.length}
                  </span>
                </h4>
                <div className="space-y-1">
                  {filteredDeals.map((deal) => (
                    <button
                      data-search-option="true"
                      key={deal.id}
                      onClick={() => handleDealSelect(deal)}
                      className="w-full text-left p-2.5 rounded-xl hover:bg-primary/5 focus-visible:outline-hidden focus-visible:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors group"
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <ResultThumb
                          src={deal.image_url ?? venueImageFor(deal)}
                          alt={`${deal.title} photo`}
                          category={deal.deal_type}
                        />
                        <div className="flex-1 min-w-0">
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
                              <span className="truncate">
                                {deal.venue_name}
                              </span>
                            </span>
                          </div>
                        </div>
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
    document.body,
  );
};
