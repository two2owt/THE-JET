import { ReactNode, memo } from "react";
import { useLocation } from "react-router";
import { Header } from "@/components/Header";
import { useLocationTracking } from "@/hooks/useLocationTracking";

/** Routes where the global Header should be hidden (full-bleed standalone pages) */
export const HEADERLESS_ROUTES = ["/auth", "/signin", "/signup", "/onboarding"];

interface AppShellProps {
  children: ReactNode;
}

/**
 * Single navigation shell wrapping every page.
 *
 * Responsibilities:
 *  - Render the global fixed Header (with avatar / search) on app routes
 *  - Reserve a spacer so fixed-positioned chrome never overlaps page content
 *  - Stay out of the way on full-bleed standalone pages (auth/onboarding)
 *
 * The BottomNav itself is rendered per-page via {@link PageLayout} so each
 * page can own its `activeTab` and notification count, but the chrome above
 * the page content is unified here.
 */
export const AppShell = memo(function AppShell({ children }: AppShellProps) {
  const { pathname } = useLocation();
  const showChrome = !HEADERLESS_ROUTES.includes(pathname);

  // Persist authenticated users' GPS fixes to user_locations via
  // check-geofence, so map density / movement / geofence notifications all
  // operate on real data.
  useLocationTracking();

  return (
    <div className="app-wrapper">
      {showChrome && (
        <>
          <Header />
          {/* Spacer reserves header height in document flow during font/asset load,
              preventing content from jumping when the fixed header paints late */}
          <div
            aria-hidden="true"
            style={{
              width: '100%',
              height: 'var(--header-total-height, 52px)',
              minHeight: 'var(--header-total-height, 52px)',
              maxHeight: 'var(--header-total-height, 52px)',
              flexShrink: 0,
              visibility: 'hidden',
              pointerEvents: 'none',
            }}
          />
        </>
      )}
      {children}
    </div>
  );
});