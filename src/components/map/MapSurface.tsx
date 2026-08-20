import { lazy, Suspense } from "react";
import { Map as MapIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LocationStatusBanner } from "@/components/map/LocationStatusBanner";
import type { Venue } from "@/types/venue";
import type { City } from "@/types/cities";

const MapboxHeatmap = lazy(() =>
  import("@/components/MapboxHeatmap").then((m) => ({
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
}: MapSurfaceProps) {
  return (
    <div className="absolute inset-0 w-full h-full" style={{ zIndex: 0 }}>
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
        {hydrated && mapboxToken && (
          <Suspense fallback={null}>
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
        <LocationStatusBanner />
      </div>
    </div>
  );
}
