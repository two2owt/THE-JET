import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Search } from "lucide-react";
import { IconButton } from "./ui/icon-button";
import { supabase } from "@/integrations/supabase/client";
import { useSearchHistory } from "@/hooks/useSearchHistory";
import { useHeaderContext } from "@/contexts/HeaderContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useProfile } from "@/hooks/useProfile";
import { useDebounce } from "@/hooks/useDebounce";
import { HeaderUserMenu } from "./navigation/HeaderUserMenu";
import { HeaderSearch } from "./navigation/HeaderSearch";

export const Header = () => {
  const navigate = useNavigate();
  const [urlSearchParams, setUrlSearchParams] = useSearchParams();
  const { venues, deals, onVenueSelect, hideSearch } = useHeaderContext();
  const isMobile = useIsMobile();
  // Search query is mirrored to the URL as `?q=...` so it's shareable and
  // survives reloads. We also keep a sessionStorage fallback for cases where
  // the URL is rewritten externally without preserving the param.
  const SEARCH_QUERY_KEY = "jet-header-search-query";
  const SEARCH_EXPANDED_KEY = "jet-header-search-expanded";
  const [searchQuery, setSearchQuery] = useState<string>(() => {
    try {
      if (typeof window === "undefined") return "";
      const url = new URLSearchParams(window.location.search).get("q");
      if (url) return url;
      return window.sessionStorage.getItem(SEARCH_QUERY_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [showResults, setShowResults] = useState(false);
  const [mounted, setMounted] = useState(false);
  const mountedRef = useRef(false);
  const [searchExpanded, setSearchExpanded] = useState<boolean>(() => {
    try {
      return typeof window !== "undefined"
        ? window.sessionStorage.getItem(SEARCH_EXPANDED_KEY) === "1"
        : false;
    } catch {
      return false;
    }
  });
  const [userId, setUserId] = useState<string | undefined>(undefined);
  const [userEmail, setUserEmail] = useState<string | undefined>(undefined);
  const { isAdmin } = useIsAdmin();
  const { profile } = useProfile(userId);
  const { addToSearchHistory } = useSearchHistory(userId);
  const historyDebounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      requestAnimationFrame(() => setMounted(true));
    }
  }, []);

  // Persist on change to BOTH sessionStorage (fast hydration) and the URL
  // (?q=) so the query is shareable / restorable via reload.
  useEffect(() => {
    try {
      if (searchQuery) window.sessionStorage.setItem(SEARCH_QUERY_KEY, searchQuery);
      else window.sessionStorage.removeItem(SEARCH_QUERY_KEY);
    } catch {
      /* storage disabled — ignore */
    }
  }, [searchQuery]);

  // Sync debounced query to the URL so results don't churn while typing.
  useEffect(() => {
    const current = urlSearchParams.get("q") ?? "";
    if (current === debouncedQuery) return;
    const next = new URLSearchParams(urlSearchParams);
    if (debouncedQuery) next.set("q", debouncedQuery);
    else next.delete("q");
    setUrlSearchParams(next, { replace: true });
  }, [debouncedQuery, urlSearchParams, setUrlSearchParams]);

  // React to external URL changes (back/forward, deep links) by syncing the
  // query state in the opposite direction.
  useEffect(() => {
    const fromUrl = urlSearchParams.get("q") ?? "";
    if (fromUrl !== searchQuery) {
      setSearchQuery(fromUrl);
      setShowResults(fromUrl.trim().length > 0);
    }
    // Only react to URL changes, not local typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlSearchParams]);

  useEffect(() => {
    try {
      if (searchExpanded) window.sessionStorage.setItem(SEARCH_EXPANDED_KEY, "1");
      else window.sessionStorage.removeItem(SEARCH_EXPANDED_KEY);
    } catch {
      /* storage disabled — ignore */
    }
  }, [searchExpanded]);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (cancelled || !user) return;
      setUserId(user.id);
      setUserEmail(user.email);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const avatarUrl = profile?.avatar_url ?? null;
  const displayName = useMemo(
    () =>
      profile?.display_name ||
      userEmail?.substring(0, 2).toUpperCase() ||
      "JT",
    [profile?.display_name, userEmail],
  );

  const debouncedQuery = useDebounce(searchQuery, 300);

  // Debounced "save-to-history" — fires once typing pauses for 1s.
  const handleQueryChange = useCallback(
    (next: string) => {
      setSearchQuery(next);
      setShowResults(next.trim().length > 0);
      if (historyDebounceRef.current) {
        window.clearTimeout(historyDebounceRef.current);
      }
      const trimmed = next.trim();
      if (trimmed.length > 2) {
        historyDebounceRef.current = window.setTimeout(() => {
          addToSearchHistory(trimmed);
        }, 1000);
      }
    },
    [addToSearchHistory]
  );

  useEffect(
    () => () => {
      if (historyDebounceRef.current) window.clearTimeout(historyDebounceRef.current);
    },
    []
  );

  const handleCloseResults = useCallback(() => setShowResults(false), []);
  const handleClearSearch = useCallback(() => {
    setSearchQuery("");
    setShowResults(false);
  }, []);
  const handleCollapseSearch = useCallback(() => {
    setSearchExpanded(false);
    // Keep the query so re-opening search restores the prior context that
    // matches the currently open JetCard / map filters.
    setShowResults(false);
  }, []);

  // Wrap the context's onVenueSelect so picking a result from the dropdown
  // closes the results panel (and collapses the mobile pill) so the JetCard
  // is unobstructed — but keeps the query intact so it stays consistent
  // with the venue/marker currently open on the map.
  const handleVenueSelectFromSearch = useCallback(
    (venue: Parameters<typeof onVenueSelect>[0]) => {
      onVenueSelect(venue);
      setShowResults(false);
      setSearchExpanded(false);
    },
    [onVenueSelect]
  );

  const showSearchBar = !hideSearch && (!isMobile || searchExpanded);
  const showSearchIcon = !hideSearch && isMobile && !searchExpanded;

  return (
    <header
      className="fixed top-0 left-0 right-0 z-[60]"
      role="banner"
      style={{
        paddingTop: 'var(--safe-area-inset-top)',
        height: 'var(--header-total-height)',
        minHeight: 'var(--header-total-height)',
        maxHeight: 'var(--header-total-height)',
        flexShrink: 0,
        contain: 'layout style',
      }}
    >
      {/* Glass background */}
      <div
        className="absolute inset-0"
        style={{
          // Deeper near-black glass for the dark luxe header
          background:
            'linear-gradient(180deg, hsl(var(--background) / 0.92), hsl(var(--background) / 0.78))',
          backdropFilter: 'blur(20px) saturate(1.6)',
          WebkitBackdropFilter: 'blur(20px) saturate(1.6)',
        }}
      />
      {/* Subtle gradient sheen */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          // Brand-led sheen kept faint; gold corner light adds the luxe note
          background:
            'linear-gradient(135deg, hsl(var(--primary) / 0.05) 0%, transparent 45%, hsl(var(--gold) / 0.04) 100%)',
        }}
      />
      {/* Bottom divider — hairline gold luxe accent */}
      <div
        className="absolute bottom-0 left-0 right-0"
        style={{
          height: '1px',
          background:
            'linear-gradient(90deg, transparent 0%, hsl(var(--gold) / 0.35) 50%, transparent 100%)',
        }}
      />

      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          flexWrap: 'nowrap',
          alignItems: 'center',
          height: '100%',
          maxWidth: '1280px',
          margin: '0 auto',
          padding: '0 clamp(12px, 2vw, 32px)',
          gap: 'clamp(8px, 1.5vw, 16px)',
          overflow: 'hidden',
        }}
      >
        {/* Logo — always visible unless mobile search is expanded */}
        {!(isMobile && searchExpanded) && (
          <div
            role="link"
            aria-label="JET — go home"
            onClick={() => navigate('/')}
            style={{
              display: 'flex',
              alignItems: 'center',
              flexShrink: 0,
              height: 'var(--touch-target-min, 44px)',
              paddingLeft: '2px',
              paddingRight: 'clamp(8px, 1.5vw, 14px)',
              marginRight: 'clamp(4px, 1vw, 8px)',
              cursor: 'pointer',
              userSelect: 'none',
              opacity: mounted ? 1 : 0,
              transform: mounted ? 'translateX(0)' : 'translateX(-8px)',
              transition: 'opacity 0.4s ease-out, transform 0.4s ease-out',
            }}
          >
            <span
              style={{
                fontSize: 'clamp(16px, 2.6vw, 22px)',
                lineHeight: 1,
                fontWeight: 800,
                letterSpacing: '-0.025em',
                backgroundImage: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)))',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                color: 'transparent',
                whiteSpace: 'nowrap',
              }}
            >
              JET
            </span>
          </div>
        )}

        {/* Search icon — mobile collapsed state */}
        {showSearchIcon && (
          <IconButton
            variant="ghost"
            ariaLabel="Open search"
            onClick={() => setSearchExpanded(true)}
            className="rounded-full transition-colors hover:bg-muted/60"
            style={{
              flexShrink: 0,
              opacity: mounted ? 1 : 0,
              transform: mounted ? 'scale(1)' : 'scale(0.8)',
              transition: 'opacity 0.3s ease-out 0.15s, transform 0.3s ease-out 0.15s',
            }}
          >
            <Search style={{ color: 'hsl(var(--muted-foreground))' }} />
          </IconButton>
        )}

        {/* Search bar — expands to fill remaining space */}
        {showSearchBar && (
          <HeaderSearch
            mounted={mounted}
            isMobile={isMobile}
            expanded={searchExpanded}
            query={searchQuery}
            showResults={showResults}
            venues={venues}
            deals={deals}
            onVenueSelect={handleVenueSelectFromSearch}
            onQueryChange={handleQueryChange}
            onClear={handleClearSearch}
            onCloseResults={handleCloseResults}
            onCollapse={handleCollapseSearch}
          />
        )}


        {/* Spacer pushes avatar flush to the right edge of the header */}
        <div style={{ flex: '1 1 0%', minWidth: 0 }} />

        {/* Avatar + dropdown menu (Profile / Settings / Admin / Sign out) */}
        <HeaderUserMenu
          mounted={mounted}
          avatarUrl={avatarUrl}
          displayName={displayName}
          userId={userId}
          email={userEmail}
          isAdmin={isAdmin}
        />
      </div>
    </header>
  );
};
