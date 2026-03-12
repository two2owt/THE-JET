import { Suspense, lazy, useEffect, useRef, memo } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Routes, Route, useLocation } from "react-router";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider } from "@/contexts/AuthContext";
import { HeaderProvider } from "@/contexts/HeaderContext";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
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

const App = () => (
  <ErrorBoundary>
    <AuthProvider>
      <HeaderProvider>
        <TooltipProvider>
          <div className="app-wrapper">
            <Toaster />
            <Sonner />
            <PageTracker />
            
            {/* Header & Footer are global, outside route Suspense */}
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
            
            <Suspense fallback={<NavigationShell />}>
              <Routes>
                {/* Main route - eagerly loaded for fastest render */}
                <Route path="/" element={<Index />} />
                
                {/* Other routes - lazy loaded */}
                <Route path="/auth" element={<Auth />} />
                <Route path="/onboarding" element={<Onboarding />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/favorites" element={<Favorites />} />
                <Route path="/social" element={<Social />} />
                <Route path="/messages" element={<Messages />} />
                <Route path="/admin" element={<AdminDashboard />} />
                <Route path="/verification-success" element={<VerificationSuccess />} />
                <Route path="/privacy-policy" element={<PrivacyPolicy />} />
                <Route path="/terms-of-service" element={<TermsOfService />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
            
            <Footer />
          </div>
        </TooltipProvider>
      </HeaderProvider>
    </AuthProvider>
  </ErrorBoundary>
);

export default App;
