import { ReactNode, useEffect, useCallback } from "react";
import { BottomNav } from "./BottomNav";
import { useBottomNavigation, type NavTab } from "@/hooks/useBottomNavigation";
import { useNotifications } from "@/hooks/useNotifications";
import { useHeaderConfig } from "@/contexts/HeaderContext";
import type { Venue } from "@/types/venue";
import type { Database } from "@/integrations/supabase/types";

type Deal = Database['public']['Tables']['deals']['Row'];

interface HeaderConfig {
  /** Venues for search - pass empty array for shell pages */
  venues?: Venue[];
  /** Deals for search - pass empty array for shell pages */
  deals?: Deal[];
  /** Handler when venue is selected from search */
  onVenueSelect?: (venue: Venue) => void;
  /** Show loading state in header */
  isLoading?: boolean;
  /** Last updated timestamp for sync indicator */
  lastUpdated?: Date | null;
  /** Refresh handler for sync indicator */
  onRefresh?: () => void;
  /** City name for sync indicator */
  cityName?: string;
  /** Hide search bar */
  hideSearch?: boolean;
}

interface PageLayoutProps {
  children: ReactNode;
  /** Default tab for this page */
  defaultTab?: NavTab;
  /** Header configuration - sets context for the global Header */
  headerConfig?: HeaderConfig;
  /** Whether this is a full-bleed page like map (no padding) */
  fullBleed?: boolean;
  /** Custom main container className */
  mainClassName?: string;
  /** Callback for prefetching on tab hover */
  onPrefetch?: (tab: NavTab) => void;
  /** Override notification count (otherwise uses unread from useNotifications) */
  notificationCount?: number;
}

/**
 * Shared page layout component that provides consistent structure:
 * - Configures the global Header via context
 * - Main content area (with proper CSS variable sizing for CLS prevention)
 * - BottomNav (with consistent navigation handling)
 * 
 * Uses CSS variables from index.css for fixed dimensions to prevent layout shifts.
 */
// Stable default references to prevent re-render loops from new refs each render
const defaultVenues: Venue[] = [];
const defaultDeals: Deal[] = [];
const defaultOnVenueSelect = () => {};

export function PageLayout({
  children,
  defaultTab = "map",
  headerConfig = {},
  fullBleed = false,
  mainClassName = "",
  onPrefetch,
  notificationCount,
}: PageLayoutProps) {
  const { activeTab, handleTabChange } = useBottomNavigation({ defaultTab });
  const { notifications } = useNotifications();
  const setHeaderConfig = useHeaderConfig();

  // Use provided notification count or calculate from notifications
  const unreadCount = notificationCount ?? notifications.filter(n => !n.read).length;

  // Sync header config to context whenever it changes
  // Use stable default references to avoid re-render loops from new function/array refs
  useEffect(() => {
    setHeaderConfig({
      venues: headerConfig.venues ?? defaultVenues,
      deals: headerConfig.deals ?? defaultDeals,
      onVenueSelect: headerConfig.onVenueSelect ?? defaultOnVenueSelect,
      isLoading: headerConfig.isLoading,
      lastUpdated: headerConfig.lastUpdated,
      onRefresh: headerConfig.onRefresh,
      cityName: headerConfig.cityName,
      hideSearch: headerConfig.hideSearch ?? false,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    headerConfig.venues,
    headerConfig.deals,
    headerConfig.onVenueSelect,
    headerConfig.isLoading,
    headerConfig.lastUpdated,
    headerConfig.onRefresh,
    headerConfig.cityName,
    headerConfig.hideSearch,
  ]);

  return (
    <div
      className="relative w-full h-full"
      style={{
        flex: '1 1 0%',
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <main
        role="main"
        className={`main-content ${fullBleed ? '' : 'page-container'} ${mainClassName}`}
        style={{
          // FIXED dimensions using centralized CSS variables
          flex: '1 1 auto',
          height: 'var(--main-height, calc(100dvh - 52px - 60px))',
          minHeight: 'var(--main-height, calc(100dvh - 52px - 60px))',
          maxHeight: 'var(--main-height, calc(100dvh - 52px - 60px))',
          contain: 'style',
          // GPU layer for smooth transitions
          transform: 'translateZ(0)',
          boxSizing: 'border-box',
          width: '100%',
          isolation: 'isolate',
          overflow: fullBleed ? 'hidden' : 'auto',
        }}
      >
        {children}
      </main>

      <BottomNav
        activeTab={activeTab}
        onTabChange={handleTabChange}
        notificationCount={unreadCount}
        onPrefetch={onPrefetch}
      />
    </div>
  );
}
