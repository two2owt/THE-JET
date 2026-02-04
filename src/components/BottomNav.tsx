import { Map, Compass, Bell, Star, Users } from "lucide-react";
import { useCallback } from "react";

type NavItem = "map" | "explore" | "notifications" | "favorites" | "social";

interface BottomNavProps {
  activeTab: NavItem;
  onTabChange: (tab: NavItem) => void;
  notificationCount?: number;
  /** Callback to prefetch heavy resources on hover/touch */
  onPrefetch?: (tab: NavItem) => void;
}

export const BottomNav = ({ activeTab, onTabChange, notificationCount = 3, onPrefetch }: BottomNavProps) => {
  // Track if we've already prefetched to avoid redundant calls
  const handlePrefetch = useCallback((tab: NavItem) => {
    if (onPrefetch && tab !== activeTab) {
      onPrefetch(tab);
    }
  }, [onPrefetch, activeTab]);
  const navItems = [
    { id: "map" as NavItem, icon: Map, label: "Map" },
    { id: "explore" as NavItem, icon: Compass, label: "Explore" },
    { id: "notifications" as NavItem, icon: Bell, label: "Alerts" },
    { id: "favorites" as NavItem, icon: Star, label: "Favorites" },
    { id: "social" as NavItem, icon: Users, label: "Friends" },
  ];

  return (
    <nav 
      className="fixed left-0 right-0 bg-card/90 backdrop-blur-xl border-t border-border/30 z-50 nav-contained text-foreground shadow-[0_-2px_10px_rgba(0,0,0,0.1)]"
      role="navigation"
      aria-label="Main navigation"
      style={{
        // iOS Safari fix: use calc with safe area for bottom positioning
        bottom: 0,
        paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 4px)',
        paddingLeft: 'var(--safe-area-inset-left)',
        paddingRight: 'var(--safe-area-inset-right)',
        // Use CSS variable for responsive height
        height: 'var(--bottom-nav-total-height)',
        minHeight: 'var(--bottom-nav-total-height)',
        maxHeight: 'var(--bottom-nav-total-height)',
        // CRITICAL: Prevent any flex compression
        flexShrink: 0,
        // Use 'layout paint' instead of 'strict' to allow color inheritance for SVGs
        contain: 'layout paint',
        transform: 'translateZ(0)',
        // Prevent any content from causing shifts
        overflow: 'hidden',
        // Ensure color inheritance works for SVG currentColor
        color: 'inherit',
      }}
    >
      <div className="max-w-7xl mx-auto px-2 sm:px-3 md:px-4 h-full flex items-center">
        <div className="flex items-center justify-around w-full">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            const Icon = item.icon;
            const hasNotification = item.id === 'notifications' && notificationCount > 0;
              
              return (
                <button
                  key={item.id}
                  onClick={() => onTabChange(item.id)}
                  onMouseEnter={() => handlePrefetch(item.id)}
                  onTouchStart={() => handlePrefetch(item.id)}
                  aria-label={`${item.label}${hasNotification ? `, ${notificationCount} unread` : ''}`}
                  aria-current={isActive ? "page" : undefined}
                  className={`relative flex flex-col items-center justify-center gap-1 px-3 sm:px-4 md:px-5 py-2 rounded-xl transition-colors duration-200 touch-manipulation focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                    isActive
                      ? "bg-gradient-primary shadow-glow text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/50 active:bg-secondary/70 active:text-foreground"
                  }`}
                  style={{
                    // Fixed dimensions to prevent CLS during tab switching
                    minWidth: 'clamp(48px, 12vw, 64px)',
                    minHeight: 'clamp(48px, 10vw, 56px)',
                    // Prevent scale transform CLS
                    transform: isActive ? 'scale(1.02)' : 'scale(1)',
                  }}
                >
                  {/* Notification badge - positioned absolutely to prevent layout shift */}
                  {hasNotification && (
                    <span 
                      className="absolute top-1 right-1 sm:right-2 w-2 h-2 sm:w-2.5 sm:h-2.5 bg-destructive rounded-full"
                      aria-hidden="true"
                    />
                  )}
                  
                  <Icon 
                    className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7" 
                    strokeWidth={isActive ? 2.5 : 2}
                    aria-hidden="true"
                  />
                  
                  <span className={`text-[10px] sm:text-xs md:text-sm font-semibold whitespace-nowrap ${
                    isActive ? "opacity-100" : "opacity-70"
                  }`}>
                    {item.label}
                  </span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
};
