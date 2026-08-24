import { lazy, Suspense, useCallback, useMemo } from "react";
import { useNavigate } from "@/lib/router-compat";
import { PageLayout } from "@/components/PageLayout";
import { PageShell } from "@/components/PageShell";
import { ExploreTabSkeleton } from "@/components/skeletons/PageSkeletons";

const ExploreTab = lazy(() =>
  import("@/components/ExploreTab").then((m) => ({ default: m.ExploreTab })),
);

/**
 * Deals tab — its own route (`/deals`) instead of a `?tab=` sub-view of the
 * map at `/`. Selecting a deal's venue hands off to the map via the standard
 * `?venue=` deep link, so the JetCard opens with its marker in context.
 */
export default function Deals() {
  const navigate = useNavigate();
  const headerConfig = useMemo(() => ({}), []);

  const handleVenueSelect = useCallback(
    (venueName: string) => {
      navigate(`/?venue=${encodeURIComponent(venueName)}`);
    },
    [navigate],
  );

  return (
    <PageLayout defaultTab="deals" headerConfig={headerConfig}>
      <PageShell>
        <h1 className="sr-only">Live deals near you</h1>
        <Suspense fallback={<ExploreTabSkeleton />}>
          <ExploreTab onVenueSelect={handleVenueSelect} />
        </Suspense>
      </PageShell>
    </PageLayout>
  );
}
