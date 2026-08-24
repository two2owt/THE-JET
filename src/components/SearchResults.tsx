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
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { createPortal } from "react-dom";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "@/lib/router-compat";
import { Card, CardContent } from "./ui/card";
import { Badge } from "./ui/badge";
import type { Venue } from "./MapboxHeatmap";
import type { Database } from "@/integrations/supabase/types";
import { useLockMapWhileInteracting } from "@/lib/mapInteractionLock";
import { requestMapFocus } from "@/lib/mapFocusBus";
import {
  setMapHighlight,
  subscribeMapHighlight,
  type MapHighlight,
} from "@/lib/mapHighlightBus";
import { activityTier } from "@/lib/activity-palette";
import { categoryIconFor } from "@/lib/category-icon";
import {
  categorySynonymScore,
  resolveVenueCategory,
} from "@/lib/venue-categories";


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
    right: number;
    width: number | null;
  } | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  // Element state (not just the ref) so the lock re-binds when the panel remounts.
  const [panelEl, setPanelEl] = useState<HTMLDivElement | null>(null);
  useLockMapWhileInteracting(panelEl, isVisible);

  const q = query.trim().toLowerCase();
  const shouldShow = isVisible && q.length > 0;

  // Collapsed = header bar only, so the whole map (and the bottom-right layer
  // toggles) stays reachable without losing the current query or scroll list.
  const [collapsed, setCollapsed] = useState(false);
  // A new search always reopens the list — collapsing is a "get out of my way"
  // gesture for the current results, not a sticky preference.
  useEffect(() => {
    setCollapsed(false);
  }, [q]);
  useEffect(() => {
    if (!shouldShow) setCollapsed(false);
  }, [shouldShow]);

  // ---- Two-way list <-> map highlight sync -------------------------------
  // Scrolling the list highlights the marker for the row at the top of the
  // viewport; hovering/selecting a marker scrolls that row into view. A short
  // suppression window on each side stops the two from ping-ponging.
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const scrollTopRef = useRef(0);
  const suppressListPublishUntil = useRef(0);
  const suppressAutoScrollUntil = useRef(0);

  const handleListScroll = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    // Remember where we are so collapsing/expanding never loses the position.
    scrollTopRef.current = list.scrollTop;
    if (Date.now() < suppressListPublishUntil.current) return;
    const listTop = list.getBoundingClientRect().top;
    const rows = Array.from(
      list.querySelectorAll<HTMLElement>("[data-result-venue-id]"),
    );
    const active =
      rows.find((row) => row.getBoundingClientRect().bottom > listTop + 12) ??
      rows[0];
    const id = active?.dataset.resultVenueId ?? null;
    if (!id) return;
    suppressAutoScrollUntil.current = Date.now() + 350;
    setHighlightId(id);
    setMapHighlight(id, "list");
  }, []);

  useEffect(() => {
    return subscribeMapHighlight(({ venueId, source }: MapHighlight) => {
      setHighlightId(venueId);
      if (source !== "map" || !venueId) return;
      if (Date.now() < suppressAutoScrollUntil.current) return;
      const list = listRef.current;
      if (!list || collapsed) return;
      const row = list.querySelector<HTMLElement>(
        `[data-result-venue-id="${CSS.escape(venueId)}"]`,
      );
      if (!row) return;
      // "nearest" keeps the current scroll position when the row is already
      // visible — no jump for rows the user is already looking at.
      suppressListPublishUntil.current = Date.now() + 400;
      row.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  }, [collapsed]);

  // Restore the remembered offset after expanding (the list is `hidden` while
  // collapsed, which zeroes scrollTop in some browsers).
  useEffect(() => {
    if (collapsed) return;
    const list = listRef.current;
    if (!list || scrollTopRef.current === 0) return;
    list.scrollTop = scrollTopRef.current;
  }, [collapsed]);

  useEffect(() => {
    scrollTopRef.current = 0;
    setHighlightId(null);
    setMapHighlight(null, "list");
  }, [q]);





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

      const viewportW = vv?.width ?? window.innerWidth;
      const isWide = viewportW >= 640;

      // Right-hand map overlays we must not cover: the top-right map control
      // stack (zoom/compass) sets our ceiling, the bottom-right layers FAB
      // cluster sets our floor. Both are measured live so the panel adapts to
      // whatever is actually rendered on this device.
      const topCtrl = document.querySelector<HTMLElement>(
        ".mapboxgl-ctrl-top-right .mapboxgl-ctrl",
      );
      const topCtrlRect = topCtrl?.getBoundingClientRect();
      const layersEl = document.querySelector<HTMLElement>(
        "[data-jet-map-layers]",
      );
      const layersRect = layersEl?.getBoundingClientRect();

      // Clear the header's hairline divider and any focus ring on the search
      // pill, so the panel never visually touches or covers the header.
      const GAP_TOP = 12;
      const GAP_BOTTOM = 12;
      const GAP_CTRL = 10;
      // Round to whole pixels: sub-pixel churn from rubber-band scrolling or
      // safe-area settling would otherwise re-render the panel every frame.
      // Hard floor at the measured header bottom: even if a measurement is
      // stale mid-transition, the panel can never render over the header.
      const top = Math.round(
        Math.max(
          headerBottom + GAP_TOP,
          GAP_TOP,
          isWide && topCtrlRect && topCtrlRect.height > 0
            ? topCtrlRect.bottom + GAP_CTRL
            : 0,
        ),
      );
      const bottom = Math.round(
        Math.max(
          navHeight + GAP_BOTTOM,
          isWide && layersRect && layersRect.height > 0
            ? viewportH + vvTop - layersRect.top + GAP_CTRL
            : 0,
        ),
      );
      const available = Math.max(160, viewportH - top - bottom);
      // Keep the map visible around the panel on tall screens, but never
      // exceed the space actually left between header and footer nav.
      const maxHeight = Math.round(
        Math.min(available, Math.max(240, viewportH * 0.52), 480),
      );

      // Align the panel's right edge with the map control gutter so the
      // stack (controls -> results -> layers) reads as one column.
      const gutter =
        isWide && layersRect
          ? Math.max(8, Math.round(viewportW - layersRect.right))
          : 16;
      const right = isWide ? gutter : 8;
      // Adaptive width: never eat more than ~38% of a wide viewport so the
      // map stays readable beside the results.
      const width = isWide
        ? Math.round(
            Math.min(
              420,
              Math.max(300, viewportW * 0.38),
              Math.max(280, viewportW - gutter * 2 - 24),
            ),
          )
        : null;

      setBox((prev) =>
        prev &&
        prev.top === top &&
        prev.bottom === bottom &&
        prev.maxHeight === maxHeight &&
        prev.right === right &&
        prev.width === width
          ? prev
          : { top, bottom, maxHeight, right, width },
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
    // `categorySynonymScore` lets everyday words ("drinks", "nightlife",
    // "brunch") reach the same category the marker glyph shows on the map.
    const rankedVenues = venues
      .map((v) => ({
        venue: v,
        score: Math.max(
          matchScore(v.name, q) * 3, // name weighted highest
          matchScore(v.category, q) * 2,
          categorySynonymScore(v.category, q) * 2,
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
          categorySynonymScore(d.deal_type, q) * 2,
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
      const score = Math.max(
        matchScore(v.category, q),
        categorySynonymScore(v.category, q),
      );
      if (!score) continue;
      const key = v.category.toLowerCase();
      const existing = catMap.get(key);
      if (existing) existing.count += 1;
      else
        catMap.set(key, { name: v.category, count: 1, score, source: "venue" });
    }
    for (const d of deals) {
      const score = Math.max(
        matchScore(d.deal_type, q),
        categorySynonymScore(d.deal_type, q),
      );
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

  /**
   * Selecting any result opens its JetCard *and* asks the map to centre and
   * pulse the matching marker. The focus request only moves the camera — layer
   * visibility (heatmap / flow paths) is untouched, so the density surface
   * stays readable underneath.
   */
  const selectVenueWithFocus = (venue: Venue) => {
    if (Number.isFinite(venue.lng) && Number.isFinite(venue.lat)) {
      requestMapFocus({
        kind: "point",
        lng: venue.lng,
        lat: venue.lat,
        id: venue.id,
        minZoom: 14.5,
      });
    }
    selectVenueWithFocus(venue);
  };

  /** Areas frame every venue in the neighborhood, then open the busiest one. */
  const handleAreaSelect = (areaName: string) => {
    const inArea = venues
      .filter((v) => v.neighborhood.toLowerCase() === areaName.toLowerCase())
      .sort((a, b) => b.activity - a.activity);
    const coords = inArea.filter(
      (v) => Number.isFinite(v.lng) && Number.isFinite(v.lat),
    );
    if (coords.length > 1) {
      const lngs = coords.map((v) => v.lng);
      const lats = coords.map((v) => v.lat);
      requestMapFocus({
        kind: "bounds",
        bounds: [
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)],
        ],
        maxZoom: 15,
      });
      onVenueSelect(coords[0]);
    } else if (inArea[0]) {
      selectVenueWithFocus(inArea[0]);
    }
    onClose();
  };

  /**
   * Category chips filter the *map* (`?cat=<taxonomy id>`) instead of jumping
   * straight to one venue. The JetCard only opens when the user then taps a
   * marker that survived the filter.
   */
  const handleCategorySelect = (categoryName: string) => {
    const def = resolveVenueCategory(categoryName);
    navigate(`/?cat=${def.id}`);
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
      selectVenueWithFocus(venueMatch);
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
        className={`fixed left-2 right-2 sm:left-auto z-[9999] sm:w-[420px] sm:max-w-[min(420px,calc(100vw-2rem))] will-change-transform motion-reduce:transition-none ${
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
          // Collapsed: release the bottom anchor so the card shrinks to its
          // header and the map + layer toggles below are fully usable.
          bottom: collapsed
            ? "auto"
            : box
              ? `${box.bottom}px`
              : "calc(var(--bottom-nav-total-height, 80px) + env(safe-area-inset-bottom, 0px) + 12px)",
          maxHeight: collapsed
            ? "none"
            : box
              ? `${box.maxHeight}px`
              : "min(calc(100dvh - var(--header-height, 56px) - var(--bottom-nav-total-height, 80px) - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 24px), 52dvh, 480px)",
          // Right-anchored on tablet/desktop so the map stays visible to the
          // left; the measured gutter matches the map control column.
          ...(box?.width
            ? { right: `${box.right}px`, left: "auto", width: `${box.width}px` }
            : {}),
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
                  {collapsed ? " · hidden" : ""}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                type="button"
                onClick={() => setCollapsed((v) => !v)}
                aria-label={
                  collapsed ? "Show search results" : "Hide search results"
                }
                aria-expanded={!collapsed}
                aria-controls="jet-search-results-list"
                title={collapsed ? "Show results" : "Hide results"}
                className="h-9 min-w-9 px-2 gap-1 rounded-full bg-secondary/60 hover:bg-primary/10 hover:text-primary text-foreground flex items-center justify-center transition-colors active:scale-95 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                {collapsed ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronUp className="w-4 h-4" />
                )}
                <span className="hidden sm:inline text-[11px] font-semibold">
                  {collapsed ? "Show" : "Hide"}
                </span>
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close search results"
                className="w-9 h-9 rounded-full bg-secondary/60 hover:bg-primary/10 hover:text-primary text-foreground flex items-center justify-center transition-colors active:scale-95 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/40 flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Scrollable body — kept mounted while collapsed so scroll position
              and any pending measurements survive the toggle. */}
          <CardContent
            ref={listRef}
            id="jet-search-results-list"
            hidden={collapsed}
            className={`p-3 sm:p-4 pb-4 space-y-4 overflow-y-auto overscroll-contain flex-1 min-h-0 ${
              collapsed ? "hidden" : ""
            }`}
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
                        selectVenueWithFocus(venue);
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
                  {filteredCategories.map((cat) => {
                    // Same glyph + accent the venue wears on the map, so a
                    // category chip and its markers read as one thing.
                    const def = resolveVenueCategory(cat.name);
                    const CatIcon = def.Icon;
                    return (
                      <button
                        data-search-option="true"
                        key={`cat-${cat.source}-${cat.name}`}
                        onClick={() => handleCategorySelect(cat.name)}
                        aria-label={`${cat.name} — ${def.label}, ${cat.count} nearby`}
                        className="group inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-secondary/60 hover:bg-primary/10 hover:text-primary border text-xs font-semibold text-foreground transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/40 active:scale-95"
                        style={{
                          borderColor: `${def.dark}40`,
                          background: `linear-gradient(150deg, ${def.dark}1A, ${def.dark}08)`,
                        }}
                      >
                        <CatIcon
                          className="w-3.5 h-3.5 flex-shrink-0"
                          style={{ color: def.dark }}
                          aria-hidden="true"
                        />
                        <span className="truncate max-w-[160px]">
                          {cat.name}
                        </span>
                        <span className="text-[10px] font-medium text-muted-foreground tabular-nums group-hover:text-primary/80">
                          {cat.count}
                        </span>
                      </button>
                    );
                  })}
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
                      data-result-venue-id={String(venue.id)}
                      key={venue.id}
                      onPointerEnter={() =>
                        setMapHighlight(String(venue.id), "list")
                      }
                      onClick={() => {
                        selectVenueWithFocus(venue);
                        onClose();
                      }}
                      className={`w-full text-left p-2.5 rounded-xl hover:bg-primary/5 focus-visible:outline-hidden focus-visible:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors group ${
                        highlightId === String(venue.id)
                          ? "bg-primary/10 ring-1 ring-primary/40"
                          : ""
                      }`}
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
