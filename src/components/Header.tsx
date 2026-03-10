import { useState, useEffect, lazy, Suspense } from "react";
import { Search, Sparkles, X } from "lucide-react";
import { Input } from "./ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSearchHistory } from "@/hooks/useSearchHistory";
import { useHeaderContext } from "@/contexts/HeaderContext";
import { useIsMobile } from "@/hooks/use-mobile";

// Lazy-load SearchResults - only needed when user starts typing
const SearchResults = lazy(() => import("./SearchResults").then(m => ({ default: m.SearchResults })));

const validateSearchQuery = (value: string): boolean => {
  return typeof value === 'string' && value.length <= 100;
};

export const Header = () => {
  const {
    venues,
    deals,
    onVenueSelect,
    hideSearch,
  } = useHeaderContext();

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

  const handleCloseResults = () => {
    setShowResults(false);
  };

  const handleCollapseSearch = () => {
    setSearchExpanded(false);
    setSearchQuery("");
    setShowResults(false);
  };

  // On mobile, show search icon that expands; on desktop, always show search bar
  const showSearchBar = !hideSearch && (!isMobile || searchExpanded);
  const showSearchIcon = !hideSearch && isMobile && !searchExpanded;

  return (
    <header 
      className="fixed top-0 left-0 right-0 z-[60] text-foreground"
      role="banner" 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 60,
        paddingTop: 'var(--safe-area-inset-top)',
        height: 'var(--header-total-height)',
        minHeight: 'var(--header-total-height)',
        maxHeight: 'var(--header-total-height)',
        flexShrink: 0,
        color: 'hsl(var(--foreground))',
      }}
    >
      {/* Glassmorphic background layer */}
      <div 
        className="absolute inset-0 bg-card/80 backdrop-blur-2xl saturate-150"
        style={{ zIndex: -1 }}
      />
      
      {/* Brand gradient overlay for depth */}
      <div 
        className="absolute inset-0 bg-gradient-to-r from-primary/8 via-transparent to-accent/8"
        style={{ zIndex: -1 }}
      />
      
      {/* Bottom border with brand gradient */}
      <div 
        className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-primary/30 via-accent/40 to-primary/30"
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 lg:px-10 h-full flex items-center" style={{ display: 'flex', alignItems: 'center', height: '100%', paddingLeft: '1rem', paddingRight: '1rem', overflow: 'hidden' }}>
        <div className="flex items-center gap-fluid-sm sm:gap-fluid-md w-full" style={{ display: 'flex', flexWrap: 'nowrap', alignItems: 'center', width: '100%', gap: '0.5rem', overflow: 'hidden' }}>
          
          {/* Logo - hidden when search is expanded on mobile */}
          {!(isMobile && searchExpanded) && (
          <a 
            href="/" 
            className="group flex items-center gap-1.5 flex-shrink-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-lg px-1 -ml-1"
            style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', minWidth: '48px', height: '32px', flexShrink: 0, whiteSpace: 'nowrap' }}
            onClick={e => {
              e.preventDefault();
              navigate('/');
            }} 
            aria-label="JET - Go to home"
          >
            <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-primary drop-shadow-[0_0_6px_hsl(var(--primary)/0.5)] group-hover:scale-110 transition-all duration-300" style={{ width: '16px', height: '16px', flexShrink: 0 }} />
            <h1 
              className="text-xl sm:text-2xl md:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-primary via-primary to-accent bg-clip-text text-transparent leading-none group-hover:drop-shadow-[0_0_8px_hsl(var(--primary)/0.4)] transition-all duration-300"
              style={{ fontSize: '1.25rem', fontWeight: 800, lineHeight: 1, margin: 0 }}
              // @ts-expect-error - elementtiming is a valid HTML attribute for LCP tracking
              elementtiming="lcp-brand"
            >
              JET
            </h1>
          </a>
          )}
          
          {/* Search icon button (mobile collapsed) */}
          {showSearchIcon && (
            <button
              onClick={() => setSearchExpanded(true)}
              className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-xl bg-secondary/50 hover:bg-secondary/70 transition-colors"
              aria-label="Open search"
            >
              <Search className="w-4 h-4 text-muted-foreground" />
            </button>
          )}

          {/* Search bar (always on desktop, expanded on mobile) */}
          {showSearchBar && (
          <div 
            className="relative flex-1 max-w-xs sm:max-w-sm"
            style={{ position: 'relative', flex: '1 1 0%', maxWidth: isMobile ? '100%' : '20rem', minWidth: '120px' }}
          >
            <div 
              className="absolute left-3 top-1/2 -translate-y-1/2 z-10 pointer-events-none"
              style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', zIndex: 10, pointerEvents: 'none' }}
            >
              <Search className="w-4 h-4 text-muted-foreground/70" style={{ width: '16px', height: '16px' }} />
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
              className="w-full pl-9 pr-9 h-9 sm:h-10 rounded-xl bg-secondary/50 border-primary/10 hover:bg-secondary/70 hover:border-primary/20 focus:bg-secondary/80 focus:border-primary/40 focus:ring-1 focus:ring-primary/30 transition-all duration-200 text-sm placeholder:text-muted-foreground/60 shadow-sm" 
              style={{ width: '100%', paddingLeft: '2.25rem', height: '36px', boxSizing: 'border-box' }}
            />
            
            {/* Close button (mobile only) */}
            {isMobile && searchExpanded && (
              <button
                onClick={handleCollapseSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-6 h-6 flex items-center justify-center rounded-md hover:bg-secondary/50 transition-colors"
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
          <div className="flex-1 min-w-0" style={{ flex: '1 1 0%', minWidth: 0 }} />

          {/* Enhanced avatar */}
          <button 
            onClick={() => navigate('/settings')} 
            className="relative flex-shrink-0 group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-full"
            style={{ width: 'clamp(36px, 9vw, 44px)', height: 'clamp(36px, 9vw, 44px)' }}
            aria-label="Open settings"
          >
            {/* Glow ring on hover */}
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary/40 to-accent/40 opacity-0 group-hover:opacity-100 blur-md transition-opacity duration-300" />
            
            <Avatar className="relative w-full h-full ring-2 ring-primary/30 group-hover:ring-primary/60 transition-all duration-300 shadow-glow">
              <AvatarImage src={avatarUrl || ""} alt="Your profile picture" className="object-cover" />
              <AvatarFallback className="bg-gradient-to-br from-primary to-accent text-primary-foreground font-black text-sm">
                {displayName.substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </button>
        </div>
      </div>
    </header>
  );
};