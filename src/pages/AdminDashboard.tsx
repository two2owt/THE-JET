import { useEffect, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Shield, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

// Lazy load admin components to reduce initial bundle - especially UserAnalytics which pulls in recharts (~200KB)
const DealManagement = lazy(() => import("@/components/admin/DealManagement").then(m => ({ default: m.DealManagement })));
const UserAnalytics = lazy(() => import("@/components/admin/UserAnalytics").then(m => ({ default: m.UserAnalytics })));
const NeighborhoodManagement = lazy(() => import("@/components/admin/NeighborhoodManagement").then(m => ({ default: m.NeighborhoodManagement })));
const MonetizationToggle = lazy(() => import("@/components/admin/MonetizationToggle").then(m => ({ default: m.MonetizationToggle })));

export default function AdminDashboard() {
  const { isAdmin, loading } = useIsAdmin();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !isAdmin) {
      navigate('/');
    }
  }, [isAdmin, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background overflow-y-auto">
      <header className="bg-card border-b border-border sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/settings')}
              className="shrink-0"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <Shield className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold text-foreground">Admin Dashboard</h1>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 pb-24">
        <Tabs defaultValue="deals" className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-6">
            <TabsTrigger value="deals">Deals</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="neighborhoods">Areas</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="deals">
            <Suspense fallback={<div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>}>
              <DealManagement />
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

          <TabsContent value="settings">
            <div className="space-y-6">
              <Suspense fallback={<div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>}>
                <MonetizationToggle />
              </Suspense>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
