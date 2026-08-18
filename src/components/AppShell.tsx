import { ReactNode, Suspense, lazy, memo, useEffect } from "react";
import { useLocation } from "@/lib/router-compat";
import { Header } from "@/components/Header";
import { useLocationTracker } from "@/hooks/useLocationTracker";
import { useColdStartLocationFallback } from "@/hooks/useColdStartLocationFallback";

const LocationPermissionPrompt = lazy(() =>
  import("@/components/LocationPermissionPrompt").then((m) => ({
    default: m.LocationPermissionPrompt,
  })),
);

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

  // Single app-wide location tracker. Runs on every route for any signed-in
  // user with location tracking enabled, and stops only on sign-out.
  useLocationTracker();

  // If no fix has landed in the last 24h (GPS denied, app closed for days),
  // force one coarse network/IP write on open so the map is never empty.
  useColdStartLocationFallback();

  // Safety net: if a modal unmounts while open, Radix can leave
  // `pointer-events: none` stuck on <body>, freezing the whole UI (including
  // the bottom nav). Clear it whenever no dialog is actually open.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const body = document.body;
    const unstick = () => {
      if (body.style.pointerEvents !== "none") return;
      const openModal = document.querySelector(
        '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [data-radix-popper-content-wrapper]',
      );
      if (!openModal) body.style.removeProperty("pointer-events");
    };
    const observer = new MutationObserver(unstick);
    observer.observe(body, {
      attributes: true,
      attributeFilter: ["style"],
      childList: true,
      subtree: true,
    });
    unstick();
    return () => observer.disconnect();
  }, []);

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
              width: "100%",
              height: "var(--header-total-height, 52px)",
              minHeight: "var(--header-total-height, 52px)",
              maxHeight: "var(--header-total-height, 52px)",
              flexShrink: 0,
              visibility: "hidden",
              pointerEvents: "none",
            }}
          />
        </>
      )}
      {children}
      {/* Location permission prompt — mounted app-wide so signed-in users are
          asked right after auth instead of only on the map tab. Self-gates on
          browser permission state and localStorage. */}
      {showChrome && (
        <Suspense fallback={null}>
          <LocationPermissionPrompt />
        </Suspense>
      )}
    </div>
  );
});
