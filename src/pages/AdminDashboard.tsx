import { lazy, Suspense } from "react";
import { Navigate } from "react-router";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2 } from "lucide-react";
import { PageLayout } from "@/components/PageLayout";
import { PageShell } from "@/components/PageShell";
import { TabPageHeader } from "@/components/TabPageHeader";
import { AdminPageSkeleton } from "@/components/skeletons/PageSkeletons";

// Lazy load admin components to reduce initial bundle - especially UserAnalytics which pulls in recharts (~200KB)
const DealManagement = lazy(() => import("@/components/admin/DealManagement").then(m => ({ default: m.DealManagement })));
const JetBridgeShortcut = lazy(() => import("@/components/admin/JetBridgeShortcut").then(m => ({ default: m.JetBridgeShortcut })));
const UserAnalytics = lazy(() => import("@/components/admin/UserAnalytics").then(m => ({ default: m.UserAnalytics })));
const NeighborhoodManagement = lazy(() => import("@/components/admin/NeighborhoodManagement").then(m => ({ default: m.NeighborhoodManagement })));
const MonetizationToggle = lazy(() => import("@/components/admin/MonetizationToggle").then(m => ({ default: m.MonetizationToggle })));
const ResendDomainStatus = lazy(() => import("@/components/admin/ResendDomainStatus").then(m => ({ default: m.ResendDomainStatus })));

export default function AdminDashboard() {
  const { isAdmin, loading } = useIsAdmin();

  if (loading) {
    return (
      <PageLayout defaultTab="map">
        <PageShell>
          <AdminPageSkeleton />
        </PageShell>
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
          <TabsList className="grid w-full grid-cols-4 mb-6">
            <TabsTrigger value="deals">Deals</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="neighborhoods">Areas</TabsTrigger>
            <TabsTrigger value="system">System</TabsTrigger>
          </TabsList>

          <TabsContent value="deals">
            <Suspense fallback={<div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>}>
              <div className="space-y-6">
                <JetBridgeShortcut />
                <DealManagement />
              </div>
            </Suspense>
          </TabsContent>

          <TabsContent value="analytics">
            <Suspense fallback={<div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>}>
              <UserAnalytics />
            </Suspense>
          </TabsContent>

          <TabsContent value="neighborhoods">
            <Suspense fallback={<div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>}>
              <NeighborhoodManagement />
            </Suspense>
          </TabsContent>

          <TabsContent value="system">
            <div className="space-y-6">
              <Suspense fallback={<div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>}>
                <MonetizationToggle />
              </Suspense>
              <Suspense fallback={<div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>}>
                <ResendDomainStatus />
              </Suspense>
            </div>
          </TabsContent>
        </Tabs>
      </PageShell>
    </PageLayout>
  );
}
