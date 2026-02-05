import { useState, useEffect } from "react";
import { Search, Sparkles } from "lucide-react";
import { Input } from "./ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { useNavigate } from "react-router-dom";
import type { Venue } from "./MapboxHeatmap";
import type { Database } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { useSearchHistory } from "@/hooks/useSearchHistory";
import { SearchResults } from "./SearchResults";

type Deal = Database['public']['Tables']['deals']['Row'];

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

  return (
    <header 
      className="fixed top-0 left-0 right-0 z-[60] text-foreground"
      role="banner" 
      style={{
        paddingTop: 'var(--safe-area-inset-top)',
        height: 'var(--header-total-height)',
        minHeight: 'var(--header-total-height)',
        maxHeight: 'var(--header-total-height)',
        flexShrink: 0,
        contain: 'layout paint',
        overflow: 'hidden',
        color: 'inherit',
      }}
    >
      {/* Glassmorphic background layer */}
      <div 
        className="absolute inset-0 bg-card/85 backdrop-blur-2xl"
        style={{ zIndex: -1 }}
      />
      
      {/* Subtle gradient overlay for depth */}
      <div 
        className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-accent/5"
        style={{ zIndex: -1 }}
      />
      
      {/* Bottom border with gradient */}
      <div 
        className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border/60 to-transparent"
      />

      <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 h-full flex items-center">
        <div className="flex items-center gap-3 sm:gap-4 md:gap-5 w-full">
          
          {/* Logo with enhanced styling */}
          <a 
            href="/" 
            className="group flex items-center gap-1.5 flex-shrink-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-lg px-1 -ml-1"
            style={{ minWidth: '48px', height: '32px' }}
            onClick={e => {
              e.preventDefault();
              navigate('/');
            }} 
            aria-label="JET - Go to home"
          >
            <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-primary opacity-80 group-hover:opacity-100 transition-opacity" />
            <h1 
              className="text-xl sm:text-2xl md:text-3xl font-black tracking-tight bg-gradient-to-r from-foreground via-foreground to-primary bg-clip-text leading-none group-hover:from-primary group-hover:to-accent transition-all duration-300"
              // @ts-expect-error - elementtiming is a valid HTML attribute for LCP tracking
              elementtiming="lcp-brand"
            >
              JET
            </h1>
          </a>
          
          {/* Enhanced search bar */}
          <div 
            className="relative flex-1 max-w-xs sm:max-w-sm"
            style={{ minWidth: '120px' }}
          >
            <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10 pointer-events-none">
              <Search className="w-4 h-4 text-muted-foreground/70" />
            </div>
            <Input 
              type="text" 
              placeholder="Search venues..." 
              value={searchQuery} 
              onChange={handleSearchChange} 
              onFocus={() => searchQuery.trim() && setShowResults(true)} 
              maxLength={100} 
              aria-label="Search venues and deals" 
              className="w-full pl-9 pr-3 h-9 sm:h-10 rounded-xl bg-secondary/40 border-border/40 hover:bg-secondary/60 focus:bg-secondary/80 focus:border-primary/40 focus:ring-1 focus:ring-primary/20 transition-all duration-200 text-sm placeholder:text-muted-foreground/60" 
            />
            
            <SearchResults 
              query={searchQuery} 
              venues={venues} 
              deals={deals} 
              onVenueSelect={onVenueSelect} 
              onClose={handleCloseResults} 
              isVisible={showResults} 
            />
          </div>

          {/* Spacer */}
          <div className="flex-1 min-w-0" />

          {/* Enhanced avatar */}
          <button 
            onClick={() => navigate('/settings')} 
            className="relative flex-shrink-0 group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-full"
            style={{ width: 'clamp(36px, 9vw, 44px)', height: 'clamp(36px, 9vw, 44px)' }}
            aria-label="Open settings"
          >
            {/* Glow ring on hover */}
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary/40 to-accent/40 opacity-0 group-hover:opacity-100 blur-md transition-opacity duration-300" />
            
            <Avatar className="relative w-full h-full ring-2 ring-border/50 group-hover:ring-primary/50 transition-all duration-200 shadow-sm">
              <AvatarImage src={avatarUrl || ""} alt="Your profile picture" className="object-cover" />
              <AvatarFallback className="bg-gradient-to-br from-primary to-accent text-primary-foreground font-bold text-sm">
                {displayName.substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </button>
        </div>
      </div>
    </header>
  );
};
