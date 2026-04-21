import { useState, useEffect, lazy, Suspense, useRef } from "react";
import { Search, Sparkles, X } from "lucide-react";
import { Input } from "./ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { useNavigate } from "react-router";
import { supabase } from "@/integrations/supabase/client";
import { useSearchHistory } from "@/hooks/useSearchHistory";
import { useHeaderContext } from "@/contexts/HeaderContext";
import { useIsMobile } from "@/hooks/use-mobile";

const SearchResults = lazy(() => import("./SearchResults").then(m => ({ default: m.SearchResults })));

const validateSearchQuery = (value: string): boolean => {
  return typeof value === 'string' && value.length <= 100;
};

export const Header = () => {
  const { venues, deals, onVenueSelect, hideSearch } = useHeaderContext();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [searchQuery, setSearchQuery] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [mounted, setMounted] = useState(false);
  const mountedRef = useRef(false);
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string>("JT");
  const [userId, setUserId] = useState<string | undefined>(undefined);
  const { addToSearchHistory } = useSearchHistory(userId);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      requestAnimationFrame(() => setMounted(true));
    }
  }, []);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setUserId(user.id);
          const { data: profile } = await supabase
            .from('profiles')
            .select('avatar_url, display_name')
            .eq('id', user.id)
            .single();
          if (profile) {
            setAvatarUrl(profile.avatar_url);
            setDisplayName(profile.display_name || user.email?.substring(0, 2).toUpperCase() || "JT");
          }
        }
      } catch {
        // Profile fetch failed, use defaults
      }
    };
    fetchProfile();
  }, []);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (!validateSearchQuery(value)) return;
    setSearchQuery(value);
    setShowResults(value.trim().length > 0);
    if (value.trim().length > 2) {
      const timeoutId = setTimeout(() => {
        addToSearchHistory(value.trim());
      }, 1000);
      return () => clearTimeout(timeoutId);
    }
  };

  const handleCloseResults = () => setShowResults(false);
  const handleCollapseSearch = () => {
    setSearchExpanded(false);
    setSearchQuery("");
    setShowResults(false);
  };

  const handleClearSearch = () => {
    setSearchQuery("");
    setShowResults(false);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      if (searchQuery) {
        handleClearSearch();
      } else if (isMobile && searchExpanded) {
        handleCollapseSearch();
      } else {
        e.currentTarget.blur();
      }
    }
  };

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
          background: 'hsl(var(--background) / 0.82)',
          backdropFilter: 'blur(20px) saturate(1.6)',
          WebkitBackdropFilter: 'blur(20px) saturate(1.6)',
        }}
      />
      {/* Subtle gradient sheen */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(135deg, hsl(var(--primary) / 0.06) 0%, transparent 50%, hsl(var(--accent) / 0.06) 100%)',
        }}
      />
      {/* Bottom divider */}
      <div
        className="absolute bottom-0 left-0 right-0"
        style={{
          height: '1px',
          background: 'linear-gradient(90deg, hsl(var(--primary) / 0.25), hsl(var(--accent) / 0.35), hsl(var(--primary) / 0.25))',
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
            role="img"
            aria-label="JET"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              flexShrink: 0,
              height: 'var(--touch-target-min, 44px)',
              padding: '0 4px',
              cursor: 'default',
              userSelect: 'none',
              opacity: mounted ? 1 : 0,
              transform: mounted ? 'translateX(0)' : 'translateX(-8px)',
              transition: 'opacity 0.4s ease-out, transform 0.4s ease-out',
            }}
          >
            <Sparkles
              style={{
                width: 'clamp(16px, 2.5vw, 20px)',
                height: 'clamp(16px, 2.5vw, 20px)',
                color: 'hsl(var(--primary))',
                filter: 'drop-shadow(0 0 6px hsl(var(--primary) / 0.5))',
              }}
              aria-hidden="true"
            />
            <span
              style={{
                fontSize: 'clamp(18px, 3vw, 24px)',
                lineHeight: 1,
                fontWeight: 800,
                letterSpacing: '-0.025em',
                backgroundImage: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)))',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                color: 'transparent',
              }}
            >
              JET
            </span>
          </div>
        )}

        {/* Search icon — mobile collapsed state */}
        {showSearchIcon && (
          <button
            onClick={() => setSearchExpanded(true)}
            className="rounded-full transition-colors hover:bg-muted/60"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              width: 'var(--touch-target-min, 44px)',
              height: 'var(--touch-target-min, 44px)',
              opacity: mounted ? 1 : 0,
              transform: mounted ? 'scale(1)' : 'scale(0.8)',
              transition: 'opacity 0.3s ease-out 0.15s, transform 0.3s ease-out 0.15s',
            }}
            aria-label="Open search"
          >
            <Search style={{ width: 'clamp(16px, 2.5vw, 20px)', height: 'clamp(16px, 2.5vw, 20px)', color: 'hsl(var(--muted-foreground))' }} />
          </button>
        )}

        {/* Search bar — expands to fill remaining space */}
        {showSearchBar && (
          <div
            style={{
              position: 'relative',
              flex: '1 1 0%',
              maxWidth: isMobile ? '100%' : 'clamp(200px, 40vw, 480px)',
              minWidth: '0',
              opacity: mounted ? 1 : 0,
              transform: mounted ? 'translateY(0)' : 'translateY(-6px)',
              transition: 'opacity 0.4s ease-out 0.1s, transform 0.4s ease-out 0.1s',
            }}
          >
            <div
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                zIndex: 10,
                pointerEvents: 'none',
              }}
            >
              <Search style={{ width: '16px', height: '16px', color: 'hsl(var(--muted-foreground) / 0.6)' }} />
            </div>
            <Input
              type="text"
              placeholder="Search venues, deals, neighborhoods..."
              value={searchQuery}
              onChange={handleSearchChange}
              onKeyDown={handleSearchKeyDown}
              onFocus={(e) => {
                searchQuery.trim() && setShowResults(true);
                e.currentTarget.style.background = 'hsl(var(--muted) / 0.55)';
                e.currentTarget.style.borderColor = 'hsl(var(--primary) / 0.5)';
                e.currentTarget.style.boxShadow = '0 0 0 3px hsl(var(--primary) / 0.1), 0 0 12px hsl(var(--primary) / 0.08)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.background = 'hsl(var(--muted) / 0.35)';
                e.currentTarget.style.borderColor = 'hsl(var(--border) / 0.5)';
                e.currentTarget.style.boxShadow = 'none';
              }}
              maxLength={100}
              aria-label="Search venues and deals"
              enterKeyHint="search"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              inputMode="search"
              autoFocus={isMobile && searchExpanded}
              style={{
                width: '100%',
                height: 'clamp(34px, 5vw, 40px)',
                paddingLeft: '36px',
                paddingRight: searchQuery ? '64px' : '36px',
                borderRadius: '9999px',
                border: '1.5px solid hsl(var(--border) / 0.5)',
                background: 'hsl(var(--muted) / 0.35)',
                fontSize: '14px',
                color: 'hsl(var(--foreground))',
                outline: 'none',
                transition: 'background 0.2s, border-color 0.3s, box-shadow 0.3s',
              }}
            />
            {/* Clear button — visible whenever there is text */}
            {searchQuery && (
              <button
                onClick={handleClearSearch}
                aria-label="Clear search"
                className="rounded-full hover:bg-muted/80 transition-colors"
                style={{
                  position: 'absolute',
                  right: isMobile && searchExpanded ? '40px' : '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  zIndex: 10,
                  width: '24px',
                  height: '24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'hsl(var(--muted) / 0.6)',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                <X style={{ width: '12px', height: '12px', color: 'hsl(var(--muted-foreground))' }} />
              </button>
            )}
            {isMobile && searchExpanded && (
              <button
                onClick={handleCollapseSearch}
                aria-label="Close search"
                className="rounded-full hover:bg-muted/60 transition-colors"
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  zIndex: 10,
                  width: '24px',
                  height: '24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X style={{ width: '14px', height: '14px', color: 'hsl(var(--muted-foreground))' }} />
              </button>
            )}
            {showResults && (
              <Suspense fallback={null}>
                <SearchResults
                  query={searchQuery}
                  venues={venues}
                  deals={deals}
                  onVenueSelect={onVenueSelect}
                  onClose={handleCloseResults}
                  isVisible={showResults}
                />
              </Suspense>
            )}
          </div>
        )}

        {/* Spacer — pushes avatar to the right */}
        <div style={{ flex: '1 1 0%', minWidth: 0 }} />

        {/* Avatar — settings link */}
        <button
          onClick={() => navigate('/settings')}
          className="group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label="Open settings"
          style={{
            position: 'relative',
            flexShrink: 0,
            borderRadius: '9999px',
            width: 'clamp(36px, 5vw, 42px)',
            height: 'clamp(36px, 5vw, 42px)',
            padding: '2px',
            background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)))',
            opacity: mounted ? 1 : 0,
            transform: mounted ? 'translateX(0)' : 'translateX(8px)',
            transition: 'opacity 0.4s ease-out 0.2s, transform 0.4s ease-out 0.2s, box-shadow 0.3s ease',
            boxShadow: '0 0 12px hsl(var(--primary) / 0.2)',
          }}
          onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 0 20px hsl(var(--primary) / 0.4)'; }}
          onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 0 12px hsl(var(--primary) / 0.2)'; }}
        >
          <Avatar
            style={{
              width: '100%',
              height: '100%',
              borderRadius: '9999px',
              overflow: 'hidden',
              border: '2px solid hsl(var(--background))',
            }}
          >
            <AvatarImage src={avatarUrl || ""} alt="Profile" className="object-cover rounded-full" style={{ objectFit: 'cover', width: '100%', height: '100%' }} />
            <AvatarFallback
              className="text-primary-foreground font-bold"
              style={{
                fontSize: 'clamp(10px, 1.5vw, 13px)',
                background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)))',
              }}
            >
              {displayName.substring(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </button>
      </div>
    </header>
  );
};
