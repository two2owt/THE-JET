import { lazy, Suspense, useCallback, useMemo, useState } from "react";
import { useNavigate } from "@/lib/router-compat";
import { PageLayout } from "@/components/PageLayout";
import { PageShell } from "@/components/PageShell";
import { ExploreTabSkeleton } from "@/components/skeletons/PageSkeletons";
import { useDealSyncRealtime } from "@/mobile-app-snippets/useDealSyncRealtime";

const ExploreTab = lazy(() =>
  import("@/components/ExploreTab").then((m) => ({ default: m.ExploreTab })),
);

const PushNotificationPrompt = lazy(() =>
  import("@/components/PushNotificationPrompt").then((m) => ({
    default: m.PushNotificationPrompt,
  })),
);


/**
 * Deals tab — its own route (`/deals`) instead of a `?tab=` sub-view of the
 * map at `/`. Selecting a deal's venue hands off to the map via the standard
 * `?venue=` deep link, so the JetCard opens with its marker in context.
 *
 * This is also the only surface that primes push notifications: the ask lands
 * on the first visit here, where deal alerts are self-evidently the point.
 * The prompt self-gates on sign-in, prior grant, browser block and a 14-day
 * dismissal snooze.
 */
export default function Deals() {
  const navigate = useNavigate();
  const headerConfig = useMemo(() => ({ hideSearch: true }), []);
  const [pushDismissed, setPushDismissed] = useState(false);
  const { deals, loading, error } = useDealSyncRealtime();

  const handleVenueSelect = useCallback(
    (venue: { id?: string | null; name: string }) => {
      // Stable venue id first so renamed or duplicate-named venues still
      // resolve to the right marker.
      const target = venue.id || venue.name;
      navigate(`/?venue=${encodeURIComponent(target)}`);
    },
    [navigate],
  );

  return (
    <PageLayout defaultTab="deals" headerConfig={headerConfig}>
      <PageShell>
        <h1 className="sr-only">Live deals near you</h1>
        <Suspense fallback={<ExploreTabSkeleton />}>
          <ExploreTab
            deals={deals}
            dealsLoading={loading}
            dealsError={error}
            onVenueSelect={handleVenueSelect}
          />
        </Suspense>
      </PageShell>


      <Suspense fallback={null}>
        <PushNotificationPrompt
          show={!pushDismissed}
          onDismiss={() => setPushDismissed(true)}
        />
      </Suspense>
    </PageLayout>
  );
}
