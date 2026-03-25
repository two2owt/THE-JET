import { useState, useEffect, lazy, Suspense } from "react";
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
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string>("JT");
  const [userId, setUserId] = useState<string | undefined>(undefined);
  const { addToSearchHistory } = useSearchHistory(userId);

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
        className="h-full mx-auto flex items-center"
        style={{
          maxWidth: '1280px',
          padding: '0 16px',
          gap: '10px',
        }}
      >
        {/* Logo */}
        {!(isMobile && searchExpanded) && (
          <a
            href="/"
            className="group flex items-center gap-1.5 flex-shrink-0 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            onClick={e => { e.preventDefault(); navigate('/'); }}
            aria-label="JET - Go to home"
            style={{ height: '36px', padding: '0 4px' }}
          >
            <Sparkles
              className="text-primary transition-transform duration-300 group-hover:scale-110"
              style={{
                width: '18px',
                height: '18px',
                filter: 'drop-shadow(0 0 6px hsl(var(--primary) / 0.5))',
              }}
            />
            <span
              className="font-extrabold tracking-tight bg-clip-text text-transparent"
              style={{
                fontSize: '22px',
                lineHeight: 1,
                backgroundImage: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)))',
              }}
            >
              JET
            </span>
          </a>
        )}

        {/* Search icon (mobile collapsed) */}
        {showSearchIcon && (
          <button
            onClick={() => setSearchExpanded(true)}
            className="flex-shrink-0 flex items-center justify-center rounded-full transition-colors hover:bg-muted/60"
            style={{ width: '36px', height: '36px' }}
            aria-label="Open search"
          >
            <Search className="w-[18px] h-[18px] text-muted-foreground" />
          </button>
        )}

        {/* Search bar */}
        {showSearchBar && (
          <div
            className="relative flex-1"
            style={{ maxWidth: isMobile ? '100%' : '280px', minWidth: '120px' }}
          >
            <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10 pointer-events-none">
              <Search className="w-4 h-4 text-muted-foreground/60" />
            </div>
            <Input
              type="text"
              placeholder="Search venues..."
              value={searchQuery}
              onChange={handleSearchChange}
              onFocus={() => searchQuery.trim() && setShowResults(true)}
              maxLength={100}
              aria-label="Search venues and deals"
              autoFocus={isMobile && searchExpanded}
              className="w-full pl-9 pr-9 h-9 rounded-full bg-muted/40 border-transparent hover:bg-muted/60 focus:bg-muted/70 focus:border-primary/30 focus:ring-1 focus:ring-primary/20 transition-all duration-200 text-sm placeholder:text-muted-foreground/50"
            />
            {isMobile && searchExpanded && (
              <button
                onClick={handleCollapseSearch}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 z-10 w-6 h-6 flex items-center justify-center rounded-full hover:bg-muted/60 transition-colors"
                aria-label="Close search"
              >
                <X className="w-3.5 h-3.5 text-muted-foreground" />
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

        {/* Spacer */}
        <div className="flex-1 min-w-0" />

        {/* Avatar */}
        <button
          onClick={() => navigate('/settings')}
          className="relative flex-shrink-0 group rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label="Open settings"
        >
          <div
            className="absolute -inset-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"
            style={{
              background: 'linear-gradient(135deg, hsl(var(--primary) / 0.3), hsl(var(--accent) / 0.3))',
              filter: 'blur(8px)',
            }}
          />
          <Avatar
            className="relative ring-[1.5px] ring-primary/25 group-hover:ring-primary/50 transition-all duration-300"
            style={{ width: '34px', height: '34px' }}
          >
            <AvatarImage src={avatarUrl || ""} alt="Profile" className="object-cover" />
            <AvatarFallback
              className="text-primary-foreground font-bold text-xs"
              style={{
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
