import { Suspense, lazy, useEffect, useRef, memo } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Routes, Route, useLocation } from "react-router";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider } from "@/contexts/AuthContext";
import { HeaderProvider } from "@/contexts/HeaderContext";
import { Header } from "@/components/Header";
import { NavigationShell } from "@/components/NavigationShell";


// Eager load Index for fastest FCP on main route
import Index from "./pages/Index";

// Lazy load other pages - they're not needed immediately
const Auth = lazy(() => import("./pages/Auth"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const Profile = lazy(() => import("./pages/Profile"));
const Settings = lazy(() => import("./pages/Settings"));
const Favorites = lazy(() => import("./pages/Favorites"));
const Social = lazy(() => import("./pages/Social"));
const Messages = lazy(() => import("./pages/Messages"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));
const VerificationSuccess = lazy(() => import("./pages/VerificationSuccess"));
const NotFound = lazy(() => import("./pages/NotFound"));

// Dev-only QA pages (tree-shaken in production builds)
const IconButtonQA = import.meta.env.DEV
  ? lazy(() => import("./pages/IconButtonQA"))
  : null;
const PanelsQA = import.meta.env.DEV
  ? lazy(() => import("./pages/PanelsQA"))
  : null;

/** Routes where the global Header should be hidden (full-bleed standalone pages) */
const HEADERLESS_ROUTES = ["/auth", "/onboarding"];

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
  const location = useLocation();
  const showHeader = !HEADERLESS_ROUTES.includes(location.pathname);

  return (
    <div className="app-wrapper">
      <Toaster />
      <Sonner />
      <PageTracker />
      
      {/* Header is fixed-positioned — only render on routes that need it */}
      {showHeader && (
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
      
      <Suspense fallback={<NavigationShell />}>
        <Routes>
          {/* Main route - eagerly loaded for fastest render */}
          <Route path="/" element={<Index />} />
          
          {/* Full-bleed standalone pages (no header/footer) */}
          <Route path="/auth" element={<Auth />} />
          <Route path="/onboarding" element={<Onboarding />} />
          
          {/* Standard app pages */}
          <Route path="/profile" element={<Profile />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/favorites" element={<Favorites />} />
          <Route path="/social" element={<Social />} />
          <Route path="/messages" element={<Messages />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/verification-success" element={<VerificationSuccess />} />
          
          {/* Legal pages — Footer is embedded inline within these pages */}
          <Route path="/privacy-policy" element={<PrivacyPolicy />} />
          <Route path="/terms-of-service" element={<TermsOfService />} />

          {/* Dev-only QA routes */}
          {IconButtonQA && (
            <Route path="/dev/icon-button" element={<IconButtonQA />} />
          )}
          {PanelsQA && (
            <Route path="/dev/panels" element={<PanelsQA />} />
          )}

          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </div>
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
