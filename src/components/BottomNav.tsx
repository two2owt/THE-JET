import { MapPinned, Flame, Bell, Heart, Users2 } from "lucide-react";
import { useCallback } from "react";

type NavItem = "map" | "explore" | "notifications" | "favorites" | "social";

interface BottomNavProps {
  activeTab: NavItem;
  onTabChange: (tab: NavItem) => void;
  notificationCount?: number;
  onPrefetch?: (tab: NavItem) => void;
}

export const BottomNav = ({ activeTab, onTabChange, notificationCount = 0, onPrefetch }: BottomNavProps) => {
  const handlePrefetch = useCallback((tab: NavItem) => {
    if (onPrefetch && tab !== activeTab) {
      onPrefetch(tab);
    }
  }, [onPrefetch, activeTab]);

  const navItems = [
    { id: "map" as NavItem, icon: MapPinned, label: "Map" },
    { id: "explore" as NavItem, icon: Flame, label: "Hot" },
    { id: "notifications" as NavItem, icon: Bell, label: "Alerts" },
    { id: "favorites" as NavItem, icon: Heart, label: "Saved" },
    { id: "social" as NavItem, icon: Users2, label: "Crew" },
  ];

  return (
    <nav
      className="fixed left-0 right-0 bottom-0 z-50"
      role="navigation"
      aria-label="Main navigation"
      style={{
        paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 4px)',
        paddingLeft: 'var(--safe-area-inset-left)',
        paddingRight: 'var(--safe-area-inset-right)',
        height: 'var(--bottom-nav-total-height)',
        minHeight: 'var(--bottom-nav-total-height)',
        maxHeight: 'var(--bottom-nav-total-height)',
        flexShrink: 0,
        contain: 'layout style',
      }}
    >
      {/* Glass background */}
      <div
        className="absolute inset-0"
        style={{
          background: 'hsl(var(--background) / 0.82)',
          backdropFilter: 'blur(24px) saturate(1.6)',
          WebkitBackdropFilter: 'blur(24px) saturate(1.6)',
        }}
      />
      {/* Top divider */}
      <div
        className="absolute top-0 left-0 right-0"
        style={{
          height: '1px',
          background: 'linear-gradient(90deg, hsl(var(--primary) / 0.2), hsl(var(--accent) / 0.3), hsl(var(--primary) / 0.2))',
        }}
      />
      {/* Soft shadow above */}
      <div
        className="absolute -top-3 left-0 right-0 h-3 pointer-events-none"
        style={{
          background: 'linear-gradient(to top, hsl(var(--background) / 0.08), transparent)',
        }}
      />

      <div
        className="h-full mx-auto flex items-center justify-around px-2 sm:px-3 md:px-4"
        style={{
          maxWidth: 'clamp(320px, 60vw, 560px)',
        }}
      >
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
              className="relative flex flex-col items-center justify-center touch-manipulation focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-xl"
              style={{
                minWidth: '56px',
                height: '48px',
                gap: '2px',
                transition: 'all 0.2s ease-out',
              }}
            >
              {/* Active pill indicator */}
              {isActive && (
                <div
                  style={{
                    position: 'absolute',
                    top: '-2px',
                    left: '12px',
                    right: '12px',
                    height: '3px',
                    borderRadius: '2px',
                    background: 'linear-gradient(90deg, hsl(var(--primary)), hsl(var(--accent)))',
                    boxShadow: '0 0 10px hsl(var(--primary) / 0.5), 0 0 4px hsl(var(--accent) / 0.3)',
                  }}
                />
              )}

              {/* Active background glow */}
              {isActive && (
                <div
                  className="absolute inset-1 rounded-lg"
                  style={{
                    background: 'linear-gradient(180deg, hsl(var(--primary) / 0.1), hsl(var(--accent) / 0.06))',
                  }}
                />
              )}

              {/* Notification badge */}
              {hasNotification && (
                <span
                  className="absolute flex items-center justify-center bg-destructive text-destructive-foreground font-bold rounded-full"
                  style={{
                    top: '2px',
                    right: '4px',
                    minWidth: '16px',
                    height: '16px',
                    padding: '0 4px',
                    fontSize: '9px',
                    lineHeight: 1,
                    boxShadow: '0 2px 6px hsl(var(--destructive) / 0.4)',
                  }}
                  aria-hidden="true"
                >
                  {notificationCount > 9 ? '9+' : notificationCount}
                </span>
              )}

              {/* Icon */}
              <Icon
                className="relative z-10"
                style={{
                  width: '20px',
                  height: '20px',
                  color: isActive ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
                  strokeWidth: isActive ? 2.4 : 1.8,
                  transition: 'color 0.2s, transform 0.2s',
                  transform: isActive ? 'scale(1.05)' : 'scale(1)',
                }}
                fill={isActive && item.id === 'favorites' ? 'currentColor' : 'none'}
                aria-hidden="true"
              />

              {/* Label */}
              <span
                className="relative z-10"
                style={{
                  fontSize: '10px',
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
                  opacity: isActive ? 1 : 0.65,
                  transition: 'all 0.2s',
                  letterSpacing: '0.01em',
                }}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
