import { lazy, Suspense, useEffect, useState, useCallback } from "react";
import { Navigate, useSearchParams } from "react-router";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { PageLayout } from "@/components/PageLayout";
import { AdminPageSkeleton } from "@/components/skeletons/PageSkeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { AdminTopbar } from "@/components/admin/AdminTopbar";
import { SecurityFindingsBanner } from "@/components/admin/SecurityFindingsBanner";
import {
  ChevronsLeft, ChevronsRight, Menu, Tag, BarChart3, MapPinned, Settings2, Filter,
} from "lucide-react";

// Lazy-loaded admin sections (UserAnalytics pulls in recharts ~200KB)
const DealManagement = lazy(() => import("@/components/admin/DealManagement").then(m => ({ default: m.DealManagement })));
const JetBridgeShortcut = lazy(() => import("@/components/admin/JetBridgeShortcut").then(m => ({ default: m.JetBridgeShortcut })));
const UserAnalytics = lazy(() => import("@/components/admin/UserAnalytics").then(m => ({ default: m.UserAnalytics })));
const ConversionFunnel = lazy(() => import("@/components/admin/ConversionFunnel").then(m => ({ default: m.ConversionFunnel })));
const NeighborhoodManagement = lazy(() => import("@/components/admin/NeighborhoodManagement").then(m => ({ default: m.NeighborhoodManagement })));
const MonetizationToggle = lazy(() => import("@/components/admin/MonetizationToggle").then(m => ({ default: m.MonetizationToggle })));
const TestPushPanel = lazy(() => import("@/components/admin/TestPushPanel").then(m => ({ default: m.TestPushPanel })));
const ManualDealSyncPanel = lazy(() => import("@/components/admin/ManualDealSyncPanel").then(m => ({ default: m.ManualDealSyncPanel })));


type SectionId = "deals" | "analytics" | "funnel" | "areas" | "system";

interface SectionDef {
  id: SectionId;
  label: string;
  description: string;
  icon: typeof Tag;
}

const SECTIONS: SectionDef[] = [
  { id: "deals",     label: "Deals",     description: "Manage merchant deals and JET Bridge sync.",   icon: Tag },
  { id: "analytics", label: "Analytics", description: "User signals, retention, and conversion.",     icon: BarChart3 },
  { id: "funnel",    label: "Funnel",    description: "Search → Deal Viewed → Deal Clicked → Checkout conversion.", icon: Filter },
  { id: "areas",     label: "Areas",     description: "Neighborhood geofences and coverage areas.",   icon: MapPinned },
  { id: "system",    label: "System",    description: "Monetization toggle and email settings.", icon: Settings2 },
];

/** Stable card-grid fallback so swapping sections never causes layout shift. */
function AdminTabFallback() {
  return (
    <div className="flex flex-col" style={{ gap: 'var(--space-md)' }}>
      <Skeleton className="h-10 w-full sm:w-72 rounded-full" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-40 sm:h-48 w-full rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

const COLLAPSE_KEY = "admin:sidebar-collapsed";

interface NavListProps {
  active: SectionId;
  onSelect: (id: SectionId) => void;
  collapsed: boolean;
}
function NavList({ active, onSelect, collapsed }: NavListProps) {
  return (
    <nav aria-label="Admin sections" className="admin-nav">
      {SECTIONS.map(({ id, label, icon: Icon }) => {
        const isActive = active === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            className={`admin-nav-item${isActive ? " admin-nav-item-active" : ""}`}
            aria-current={isActive ? "page" : undefined}
            title={collapsed ? label : undefined}
          >
            <span className="admin-nav-indicator" aria-hidden="true" />
            <Icon className="admin-nav-icon" />
            <span className={`admin-nav-label${collapsed ? " admin-nav-label-hidden" : ""}`}>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export default function AdminDashboard() {
  const { isAdmin, loading } = useIsAdmin();
  const [searchParams, setSearchParams] = useSearchParams();

  // Read URL ?section=... so deep links work; default to deals.
  const urlSection = (searchParams.get("section") as SectionId | null);
  const initial: SectionId = (urlSection && SECTIONS.some(s => s.id === urlSection)) ? urlSection : "deals";
  const [section, setSection] = useState<SectionId>(initial);

  // Persist desktop collapse preference.
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(COLLAPSE_KEY) === "1"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0"); } catch { /* ignore */ }
  }, [collapsed]);

  // Mobile drawer state.
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Sync URL when section changes via UI.
  const handleSelect = useCallback((id: SectionId) => {
    setSection(id);
    setDrawerOpen(false);
    const next = new URLSearchParams(searchParams);
    next.set("section", id);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  if (loading) {
    return (
      <PageLayout defaultTab="map">
        <AdminPageSkeleton />
      </PageLayout>
    );
  }
  if (!isAdmin) return <Navigate to="/" replace />;

  const current = SECTIONS.find(s => s.id === section)!;

  return (
    <PageLayout defaultTab="map">
      <div className={`admin-shell${collapsed ? " admin-shell-collapsed" : ""}`}>
        {/* ===== Desktop sidebar (lg+) ===== */}
        <aside
          className="admin-sidebar"
          aria-label="Admin navigation"
          data-collapsed={collapsed ? "true" : "false"}
        >
          <div className="admin-sidebar-header">
            <span className={`admin-sidebar-eyebrow${collapsed ? " admin-nav-label-hidden" : ""}`}>
              Admin
            </span>
            <button
              type="button"
              onClick={() => setCollapsed(v => !v)}
              className="admin-sidebar-toggle"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-pressed={collapsed}
            >
              {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
            </button>
          </div>
          <NavList active={section} onSelect={handleSelect} collapsed={collapsed} />
        </aside>

        {/* ===== Mobile drawer (<lg) ===== */}
        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetContent side="left" className="admin-drawer p-0 w-[280px] sm:w-[320px]">
            <SheetTitle className="sr-only">Admin navigation</SheetTitle>
            <div className="admin-sidebar-header">
              <span className="admin-sidebar-eyebrow">Admin</span>
            </div>
            <NavList active={section} onSelect={handleSelect} collapsed={false} />
          </SheetContent>
        </Sheet>

        {/* ===== Content column ===== */}
        <section className="admin-content" aria-labelledby="admin-section-title">
          <div className="admin-content-inner">
            {/* Topbar: blur search, notifications, user menu */}
            <AdminTopbar
              items={SECTIONS.map(s => ({ id: s.id, label: s.label, description: s.description }))}
              onSelect={(id) => handleSelect(id as SectionId)}
            />
            {/* Page header: trigger + title + description + (future actions slot) */}
            <header className="admin-page-header">
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                className="admin-drawer-trigger"
                aria-label="Open admin navigation"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div className="admin-page-header-text">
                <div className="admin-breadcrumbs" aria-label="Breadcrumbs">
                  <span className="opacity-60">Admin</span>
                  <span aria-hidden="true" className="opacity-40">/</span>
                  <span className="font-semibold text-foreground">{current.label}</span>
                </div>
                <h1 id="admin-section-title" className="admin-page-title">{current.label}</h1>
                <p className="admin-page-description">{current.description}</p>
              </div>
            </header>

            {/* Section content */}
            <div className="admin-section">
              <div className="mb-4">
                <SecurityFindingsBanner />
              </div>
              {section === "deals" && (
                <Suspense fallback={<AdminTabFallback />}>
                  <div className="flex flex-col" style={{ gap: 'var(--space-md)' }}>
                    <JetBridgeShortcut />
                    <ManualDealSyncPanel />
                    <DealManagement />
                  </div>
                </Suspense>
              )}
              {section === "analytics" && (
                <Suspense fallback={<AdminTabFallback />}>
                  <UserAnalytics />
                </Suspense>
              )}
              {section === "funnel" && (
                <Suspense fallback={<AdminTabFallback />}>
                  <ConversionFunnel />
                </Suspense>
              )}
              {section === "areas" && (
                <Suspense fallback={<AdminTabFallback />}>
                  <NeighborhoodManagement />
                </Suspense>
              )}
              {section === "system" && (
                <div className="flex flex-col" style={{ gap: 'var(--space-md)' }}>
                  <Suspense fallback={<AdminTabFallback />}>
                    <MonetizationToggle />
                  </Suspense>
                  <Suspense fallback={<AdminTabFallback />}>
                    <TestPushPanel />
                  </Suspense>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </PageLayout>
  );
}
