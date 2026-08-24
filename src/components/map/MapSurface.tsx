import { lazy, Suspense, useEffect, useRef } from "react";
import { Map as MapIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LocationStatusBanner } from "@/components/map/LocationStatusBanner";
import { HeatmapSkeleton } from "@/components/skeletons/HeatmapSkeleton";
import { useInViewAfterPaint } from "@/hooks/useInViewAfterPaint";
import type { Venue } from "@/types/venue";
import type { City } from "@/types/cities";

const importMapboxHeatmap = () => import("@/components/MapboxHeatmap");

const MapboxHeatmap = lazy(() =>
  importMapboxHeatmap().then((m) => ({
    default: m.MapboxHeatmap,
  })),
);

interface MapSurfaceProps {
  mapboxToken: string | null;
  mapboxLoading: boolean;
  mapboxError: string | null;
  /** Gate rendering on hydration: a warm cached token diverges from SSR. */
  hydrated: boolean;
  venues: Venue[];
  venuesLoading: boolean;
  selectedVenue: Venue | null;
  selectedCity: City;
  resetUIKey: number;
  onVenueSelect: (venue: Venue | string) => void;
  onParkingSelect: (parking: {
    lat: number;
    lng: number;
    name?: string;
  }) => void;
  onCityChange: (city: City) => void;
  onNearestCityDetected: (city: City) => void;
  onDetectedLocationNameChange: (name: string | null) => void;
  categoryFilter: string[];
  onCategoryFilterChange: (next: string[]) => void;
}

/**
 * Full-screen map layer: the Mapbox canvas, its error state, and the
 * permission-aware location banner. Purely presentational — all state lives
 * in the page or in the map/city hooks.
 */
export function MapSurface({
  mapboxToken,
  mapboxLoading,
  mapboxError,
  hydrated,
  venues,
  venuesLoading,
  selectedVenue,
  selectedCity,
  resetUIKey,
  onVenueSelect,
  onParkingSelect,
  onCityChange,
  onNearestCityDetected,
  onDetectedLocationNameChange,
  categoryFilter,
  onCategoryFilterChange,
}: MapSurfaceProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // The ~500 kB GL chunk is only fetched once this surface is actually on
  // screen, and never before the page load event — identical behaviour on
  // mobile and desktop, both of which render this same surface.
  const inView = useInViewAfterPaint(containerRef, {
    enabled: hydrated && Boolean(mapboxToken),
  });

  // If the surface never comes into view, still warm the chunk during idle so
  // a later scroll/tab switch renders instantly instead of waiting on network.
  useEffect(() => {
    if (!hydrated || inView || typeof window === "undefined") return;
    const warm = () => void importMapboxHeatmap().catch(() => {});
    const idle = typeof window.requestIdleCallback === "function";
    const id = idle
      ? window.requestIdleCallback(warm, { timeout: 8000 })
      : window.setTimeout(warm, 6000);
    return () => {
      if (idle) window.cancelIdleCallback(id);
      else window.clearTimeout(id);
    };
  }, [hydrated, inView]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 w-full h-full"
      style={{ zIndex: 0 }}
      data-map-container=""
    >
      {/* Paints on the very first frame (before hydration, before the token
          resolves, before the GL bundle downloads) so the viewport has a real
          LCP candidate instead of an empty box. The map canvas covers it. */}
      {!(hydrated && mapboxToken && inView) && !mapboxError && (
        <HeatmapSkeleton />
      )}

      {mapboxError && !mapboxLoading && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center"
          style={{ background: "hsl(var(--background))" }}
        >
          <div className="text-center p-6">
            <div
              className="w-14 h-14 mx-auto rounded-full flex items-center justify-center"
              style={{ background: "hsl(var(--destructive) / 0.1)" }}
            >
              <MapIcon
                className="w-7 h-7"
                style={{ color: "hsl(var(--destructive))" }}
              />
            </div>
            <div className="mt-3">
              <p className="text-sm font-medium text-foreground">
                Unable to load map
              </p>
              <p className="text-xs text-muted-foreground max-w-[280px] mx-auto mt-1">
                {mapboxError}
              </p>
            </div>
            <Button
              variant="outline"
              size="default"
              onClick={() => window.location.reload()}
              className="mt-3"
            >
              Try Again
            </Button>
          </div>
        </div>
      )}

      <div className="absolute inset-0 w-full h-full">
        {hydrated && mapboxToken && inView && (
          <Suspense fallback={<HeatmapSkeleton />}>
            <MapboxHeatmap
              onVenueSelect={onVenueSelect}
              onParkingSelect={onParkingSelect}
              venues={venues}
              mapboxToken={mapboxToken}
              selectedCity={selectedCity}
              onCityChange={onCityChange}
              onNearestCityDetected={onNearestCityDetected}
              onDetectedLocationNameChange={onDetectedLocationNameChange}
              isLoadingVenues={venuesLoading}
              selectedVenue={selectedVenue}
              resetUIKey={resetUIKey}
              categoryFilter={categoryFilter}
              onCategoryFilterChange={onCategoryFilterChange}
              isTokenLoading={false}
            />
          </Suspense>
        )}
      </div>

      {/* Effective location-tracking status (permission-aware) */}
      <div
        className="absolute left-1/2 -translate-x-1/2 z-30 pointer-events-none flex justify-center"
        style={{ top: "calc(var(--map-ui-inset-top, 0.75rem) + 3.5rem)" }}
      >
        <LocationStatusBanner cityName={selectedCity?.name} />
      </div>
    </div>
  );
}
