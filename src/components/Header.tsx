import { useState, useEffect, lazy, Suspense } from "react";
import { Search } from "lucide-react";
import { Input } from "./ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { useNavigate } from "react-router-dom";
import type { Venue } from "./MapboxHeatmap";
import type { Database } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { useSearchHistory } from "@/hooks/useSearchHistory";

// Lazy load search results - only needed when user searches
const SearchResults = lazy(() => import("./SearchResults").then(m => ({ default: m.SearchResults })));

// Lazy load sync status - not critical for initial render
const SyncStatusIndicator = lazy(() => import("./SyncStatusIndicator").then(m => ({ default: m.SyncStatusIndicator })));

type Deal = Database['public']['Tables']['deals']['Row'];

// Simple validation without zod - avoids loading 13KB library
const validateSearchQuery = (value: string): boolean => {
  return typeof value === 'string' && value.length <= 100;
};
interface HeaderProps {
  venues: Venue[];
  deals: Deal[];
  onVenueSelect: (venue: Venue) => void;
  isLoading?: boolean;
  lastUpdated?: Date | null;
  onRefresh?: () => void;
  cityName?: string;
}
export const Header = ({
  venues,
  deals,
  onVenueSelect,
  isLoading,
  lastUpdated,
  onRefresh,
  cityName
}: HeaderProps) => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string>("JT");
  const [userId, setUserId] = useState<string | undefined>(undefined);
  const {
    addToSearchHistory
  } = useSearchHistory(userId);
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const {
          data: {
            user
          }
        } = await supabase.auth.getUser();
        if (user) {
          setUserId(user.id);
          const {
            data: profile
          } = await supabase.from('profiles').select('avatar_url, display_name').eq('id', user.id).single();
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

    // Simple validation without zod - avoids loading 13KB library
    if (!validateSearchQuery(value)) {
      return; // Reject invalid input
    }
    
    setSearchQuery(value);
    setShowResults(value.trim().length > 0);

    // Track search after a short delay (debounced)
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
  return (
    <header 
      className="bg-card/98 backdrop-blur-xl border-b border-border/50 sticky top-0 z-[60] header-contained text-foreground" 
      role="banner" 
      style={{
        paddingTop: 'var(--safe-area-inset-top)',
        // FIXED dimensions using CSS variables - must match shell-header exactly
        height: 'var(--header-total-height)',
        minHeight: 'var(--header-total-height)',
        maxHeight: 'var(--header-total-height)',
        // CRITICAL: Prevent flex container from shrinking this element
        flexShrink: 0,
        // Containment prevents CLS - use 'layout paint' to allow color inheritance
        contain: 'layout paint',
        transform: 'translateZ(0)',
        overflow: 'hidden',
        // Explicit positioning to prevent layout recalculation
        position: 'sticky',
        top: 0,
        // Ensure color inheritance works for SVG currentColor
        color: 'inherit',
      }}
    >
      {/* Use fluid spacing that adapts to device size */}
      <div className="max-w-7xl mx-auto px-fluid-sm sm:px-fluid-md md:px-fluid-lg h-full flex items-center">
        <div className="flex items-center gap-2 sm:gap-3 md:gap-4 w-full">
          {/* Logo - LCP element with elementtiming for performance tracking */}
          {/* FIXED dimensions to prevent CLS - must match skeleton */}
          <a 
            href="/" 
            className="flex items-center flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-md"
            style={{
              // Fixed dimensions to prevent layout shift
              minWidth: '36px',
              height: '24px',
            }}
            onClick={e => {
              e.preventDefault();
              navigate('/');
            }} 
            aria-label="JET - Go to home"
          >
            <h1 
              className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-black text-foreground tracking-wider leading-none"
              // @ts-expect-error - elementtiming is a valid HTML attribute for LCP tracking
              elementtiming="lcp-brand"
            >
              JET
            </h1>
          </a>
          
          {/* Search Bar - FIXED width with responsive scaling */}
          <div 
            className="relative flex-shrink-0"
            style={{
              // Fixed widths per breakpoint to prevent CLS
              width: 'clamp(100px, 20vw, 280px)',
              minWidth: '100px',
            }}
          >
            <Search className="absolute left-2 sm:left-2.5 md:left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-4.5 md:h-4.5 text-muted-foreground pointer-events-none z-10" />
            <Input 
              type="text" 
              placeholder="Search..." 
              value={searchQuery} 
              onChange={handleSearchChange} 
              onFocus={() => searchQuery.trim() && setShowResults(true)} 
              maxLength={100} 
              aria-label="Search venues and deals" 
              className="w-full pl-7 sm:pl-8 md:pl-9 pr-2 sm:pr-3 h-8 sm:h-9 md:h-10 rounded-full bg-secondary/50 border-border/50 focus:bg-secondary focus:border-primary/50 transition-colors text-xs sm:text-sm md:text-base text-foreground placeholder:text-muted-foreground" 
            />
            
            {/* Lazy-loaded search results - only loads when user searches */}
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
          </div>

          {/* Sync Status - Takes remaining width between search and avatar */}
          <div className="flex-1 min-w-0 px-1 sm:px-2 md:px-3 flex items-center">
            <Suspense fallback={null}>
              <SyncStatusIndicator 
                isLoading={isLoading} 
                lastUpdated={lastUpdated} 
                onRefresh={onRefresh} 
                showTimestamp={true} 
                compact={true} 
                cityName={cityName} 
                isInitializing={!lastUpdated && !isLoading} 
              />
            </Suspense>
          </div>

          {/* Avatar - FIXED dimensions, renders immediately with fallback */}
          <div 
            className="flex-shrink-0"
            style={{
              // Fixed dimensions to prevent CLS
              width: 'clamp(32px, 8vw, 44px)',
              height: 'clamp(32px, 8vw, 44px)',
            }}
          >
            <button 
              onClick={() => navigate('/settings')} 
              className="w-full h-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-full"
              aria-label="Open settings"
            >
              <Avatar className="w-full h-full border-2 border-primary/30 cursor-pointer hover:border-primary transition-colors">
                <AvatarImage src={avatarUrl || ""} alt="Your profile picture" />
                <AvatarFallback className="bg-gradient-primary text-primary-foreground font-semibold text-xs sm:text-sm md:text-base">
                  {displayName.substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};