import { Suspense, lazy, useEffect, useRef, memo } from "react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Routes, Route, useLocation } from "react-router";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider } from "@/contexts/AuthContext";
import { HeaderProvider } from "@/contexts/HeaderContext";
import { NavigationShell } from "@/components/NavigationShell";
import { AppShell } from "@/components/AppShell";
import { PageLayout } from "@/components/PageLayout";
import type { NavTab } from "@/hooks/useBottomNavigation";
import {
  FavoritesPageSkeleton,
  SocialPageSkeleton,
  ProfilePageSkeleton,
  MessagesPageSkeleton,
  AdminPageSkeleton,
} from "@/components/skeletons/PageSkeletons";

// Eager load Index for fastest FCP on main route
import Index from "./pages/Index";

// Lazy load other pages - they're not needed immediately
const Auth = lazy(() => import("./pages/Auth"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const Profile = lazy(() => import("./pages/Profile"));
const Favorites = lazy(() => import("./pages/Favorites"));
const Social = lazy(() => import("./pages/Social"));
const Messages = lazy(() => import("./pages/Messages"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));
const VerificationSuccess = lazy(() => import("./pages/VerificationSuccess"));
const NotFound = lazy(() => import("./pages/NotFound"));

/**
 * Per-route Suspense fallback that mirrors the destination page's
 * PageLayout wrapper. This avoids the "global shell → generic
 * skeleton → real skeleton → content" flicker by rendering the
 * correct shell + skeleton from the very first frame.
 */
function RouteFallback({
  defaultTab = "map",
  hideSearch = true,
  children,
}: {
  defaultTab?: NavTab;
  hideSearch?: boolean;
  children: React.ReactNode;
}) {
  return (
    <PageLayout defaultTab={defaultTab} headerConfig={{ hideSearch }}>
      {children}
    </PageLayout>
  );
}

const PageTracker = memo(function PageTracker() {
  const location = useLocation();
  const analyticsRef = useRef<typeof import("@/lib/analytics").analytics | null>(null);
  
  useEffect(() => {
    // Lazy load analytics module to reduce initial bundle
    if (!analyticsRef.current) {
      import("@/lib/analytics").then(({ analytics }) => {
        analyticsRef.current = analytics;
        analytics.pageView(location.pathname);
      });
    } else {
      analyticsRef.current.pageView(location.pathname);
    }
  }, [location.pathname]);
  
  return null;
});

/** Route-aware layout shell that conditionally renders Header + spacer */
const AppLayout = memo(function AppLayout() {
  return (
    <AppShell>
      <Sonner />
      <PageTracker />

      <Routes>
        {/* Main route - eagerly loaded for fastest render */}
        <Route path="/" element={<Index />} />

        {/* Full-bleed standalone pages (no header/footer) */}
        <Route
          path="/auth"
          element={
            <Suspense fallback={<NavigationShell />}>
              <Auth />
            </Suspense>
          }
        />
        <Route
          path="/onboarding"
          element={
            <Suspense fallback={<NavigationShell />}>
              <Onboarding />
            </Suspense>
          }
        />

        {/* Standard app pages — fallback mirrors each page's real shell */}
        <Route
          path="/profile"
          element={
            <Suspense fallback={<RouteFallback defaultTab="map"><ProfilePageSkeleton /></RouteFallback>}>
              <Profile />
            </Suspense>
          }
        />
        <Route
          path="/favorites"
          element={
            <Suspense fallback={<RouteFallback defaultTab="favorites"><FavoritesPageSkeleton /></RouteFallback>}>
              <Favorites />
            </Suspense>
          }
        />
        <Route
          path="/social"
          element={
            <Suspense fallback={<RouteFallback defaultTab="social"><SocialPageSkeleton /></RouteFallback>}>
              <Social />
            </Suspense>
          }
        />
        <Route
          path="/messages"
          element={
            <Suspense fallback={<RouteFallback defaultTab="social"><MessagesPageSkeleton /></RouteFallback>}>
              <Messages />
            </Suspense>
          }
        />
        <Route
          path="/admin"
          element={
            <Suspense fallback={<RouteFallback defaultTab="map"><AdminPageSkeleton /></RouteFallback>}>
              <AdminDashboard />
            </Suspense>
          }
        />
        <Route
          path="/verification-success"
          element={
            <Suspense fallback={<NavigationShell />}>
              <VerificationSuccess />
            </Suspense>
          }
        />
        {/* Legal pages — Footer is embedded inline within these pages */}
        <Route
          path="/privacy-policy"
          element={
            <Suspense fallback={<NavigationShell />}>
              <PrivacyPolicy />
            </Suspense>
          }
        />
        <Route
          path="/terms-of-service"
          element={
            <Suspense fallback={<NavigationShell />}>
              <TermsOfService />
            </Suspense>
          }
        />

        <Route
          path="*"
          element={
            <Suspense fallback={<NavigationShell />}>
              <NotFound />
            </Suspense>
          }
        />
      </Routes>
    </AppShell>
  );
});

const App = () => (
  <ErrorBoundary>
    <AuthProvider>
      <HeaderProvider>
        <TooltipProvider>
          <AppLayout />
        </TooltipProvider>
      </HeaderProvider>
    </AuthProvider>
  </ErrorBoundary>
);

export default App;
