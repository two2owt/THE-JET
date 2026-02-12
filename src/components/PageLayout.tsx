import { ReactNode } from "react";
import { Header } from "./Header";
import { BottomNav } from "./BottomNav";
import { useBottomNavigation, type NavTab } from "@/hooks/useBottomNavigation";
import { useNotifications } from "@/hooks/useNotifications";
import type { Venue } from "./MapboxHeatmap";
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
  /** Header configuration - omit for shell header with empty data */
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
 * - Header (with search, sync status, avatar)
 * - Main content area (with proper CSS variable sizing for CLS prevention)
 * - BottomNav (with consistent navigation handling)
 * 
 * Uses CSS variables from index.css for fixed dimensions to prevent layout shifts.
 */
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

  // Use provided notification count or calculate from notifications
  const unreadCount = notificationCount ?? notifications.filter(n => !n.read).length;

  // Default header config for shell pages
  const {
    venues = [],
    deals = [],
    onVenueSelect = () => {},
    isLoading,
    lastUpdated,
    onRefresh,
    cityName,
    hideSearch,
  } = headerConfig;

  return (
    <div
      className="relative w-full h-full"
      style={{
        flex: '1 1 0%',
        minHeight: 0,
        overflow: 'hidden',
        // Reserve space for fixed header at top
        paddingTop: 'var(--header-total-height)',
      }}
    >
      <Header
        venues={venues}
        deals={deals}
        onVenueSelect={onVenueSelect}
        isLoading={isLoading}
        lastUpdated={lastUpdated}
        onRefresh={onRefresh}
        cityName={cityName}
        hideSearch={hideSearch}
      />

      <main
        role="main"
        className={`main-content ${fullBleed ? '' : 'page-container'} ${mainClassName}`}
        style={{
          // FIXED dimensions using centralized CSS variables
          flex: '1 1 auto',
          height: 'var(--main-height)',
          minHeight: 'var(--main-height)',
          maxHeight: 'var(--main-height)',
          // CSS containment for performance - use layout+style (not strict) to allow scrolling
          contain: 'layout style',
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
