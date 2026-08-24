import { lazy, Suspense, useCallback, useMemo } from "react";
import { useNavigate } from "@/lib/router-compat";
import { PageLayout } from "@/components/PageLayout";
import { PageShell } from "@/components/PageShell";
import { NotificationsTabSkeleton } from "@/components/skeletons/PageSkeletons";
import { useNotifications } from "@/hooks/useNotifications";
import { useDealSyncRealtime } from "@/mobile-app-snippets/useDealSyncRealtime";
import type { Venue } from "@/types/venue";

const NotificationsTab = lazy(() =>
  import("@/components/notifications/NotificationsTab").then((m) => ({
    default: m.NotificationsTab,
  })),
);

/**
 * Alerts tab — its own route (`/alerts`) instead of a `?tab=` sub-view of the
 * map at `/`. Tapping a notification's venue hands off to the map via the
 * standard `?venue=` deep link so the JetCard opens with its marker.
 */
export default function Alerts() {
  const navigate = useNavigate();
  const headerConfig = useMemo(() => ({ hideSearch: true }), []);
  const {
    notifications,
    expiredNotifications,
    dealById,
    markAsRead,
    markAllAsRead,
  } = useNotifications(true);

  const { deals } = useDealSyncRealtime();

  const handleVenueClick = useCallback(
    (venue: Venue | string) => {
      // Alert cards hand back the linked deal's venue id when known; only
      // legacy alerts without a linked deal fall back to the display name.
      const target = typeof venue === "string" ? venue : venue.id || venue.name;
      navigate(`/?venue=${encodeURIComponent(target)}`);
    },
    [navigate],
  );

  return (
    <PageLayout defaultTab="notifications" headerConfig={headerConfig}>
      <PageShell>
        <h1 className="sr-only">Your alerts</h1>
        <Suspense fallback={<NotificationsTabSkeleton />}>
          <NotificationsTab
            notifications={notifications}
            deals={deals}
            markAsRead={markAsRead}
            markAllAsRead={markAllAsRead}
            onVenueClick={handleVenueClick}
          />
        </Suspense>
      </PageShell>
    </PageLayout>
  );
}
