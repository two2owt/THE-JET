import { lazy, Suspense } from "react";
import { Navigate } from "react-router";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageLayout } from "@/components/PageLayout";
import { PageShell } from "@/components/PageShell";
import { TabPageHeader } from "@/components/TabPageHeader";
import { AdminPageSkeleton } from "@/components/skeletons/PageSkeletons";
import { Skeleton } from "@/components/ui/skeleton";

// Lazy load admin components to reduce initial bundle - especially UserAnalytics which pulls in recharts (~200KB)
const DealManagement = lazy(() => import("@/components/admin/DealManagement").then(m => ({ default: m.DealManagement })));
const JetBridgeShortcut = lazy(() => import("@/components/admin/JetBridgeShortcut").then(m => ({ default: m.JetBridgeShortcut })));
const UserAnalytics = lazy(() => import("@/components/admin/UserAnalytics").then(m => ({ default: m.UserAnalytics })));
const NeighborhoodManagement = lazy(() => import("@/components/admin/NeighborhoodManagement").then(m => ({ default: m.NeighborhoodManagement })));
const MonetizationToggle = lazy(() => import("@/components/admin/MonetizationToggle").then(m => ({ default: m.MonetizationToggle })));
const ResendDomainStatus = lazy(() => import("@/components/admin/ResendDomainStatus").then(m => ({ default: m.ResendDomainStatus })));

/**
 * Inline fallback for lazy-loaded tab content. Uses the same card grid
 * pattern as <AdminPageSkeleton> so the perceived layout stays stable
 * when switching tabs (0 CLS).
 */
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

export default function AdminDashboard() {
  const { isAdmin, loading } = useIsAdmin();

  if (loading) {
    return (
      <PageLayout defaultTab="map">
        <AdminPageSkeleton />
      </PageLayout>
    );
  }

  // Route-level guard: non-admins are redirected before any admin UI renders.
  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return (
    <PageLayout defaultTab="map">
      <PageShell>
        <TabPageHeader
          title="Admin Dashboard"
          subtitle="Deals, analytics, areas, and system controls"
        />
        <Tabs defaultValue="deals" className="w-full">
          {/* Adaptive trigger row — equal columns, comfortable touch targets
              (≥44px) on mobile, condensed text on the smallest phones. */}
          <TabsList
            className="grid w-full grid-cols-4 h-auto p-1 rounded-xl"
            style={{ marginBottom: 'var(--space-md)' }}
          >
            <TabsTrigger value="deals" className="py-2 text-xs sm:text-sm">Deals</TabsTrigger>
            <TabsTrigger value="analytics" className="py-2 text-xs sm:text-sm">Analytics</TabsTrigger>
            <TabsTrigger value="neighborhoods" className="py-2 text-xs sm:text-sm">Areas</TabsTrigger>
            <TabsTrigger value="system" className="py-2 text-xs sm:text-sm">System</TabsTrigger>
          </TabsList>

          <TabsContent value="deals" className="mt-0">
            <Suspense fallback={<AdminTabFallback />}>
              <div className="flex flex-col" style={{ gap: 'var(--space-md)' }}>
                <JetBridgeShortcut />
                <DealManagement />
              </div>
            </Suspense>
          </TabsContent>

          <TabsContent value="analytics" className="mt-0">
            <Suspense fallback={<AdminTabFallback />}>
              <UserAnalytics />
            </Suspense>
          </TabsContent>

          <TabsContent value="neighborhoods" className="mt-0">
            <Suspense fallback={<AdminTabFallback />}>
              <NeighborhoodManagement />
            </Suspense>
          </TabsContent>

          <TabsContent value="system" className="mt-0">
            <div className="flex flex-col" style={{ gap: 'var(--space-md)' }}>
              <Suspense fallback={<AdminTabFallback />}>
                <MonetizationToggle />
              </Suspense>
              <Suspense fallback={<AdminTabFallback />}>
                <ResendDomainStatus />
              </Suspense>
            </div>
          </TabsContent>
        </Tabs>
      </PageShell>
    </PageLayout>
  );
}
