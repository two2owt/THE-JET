/**
 * Dev-only preview page for Heatmap and JetCard panels.
 * Mounted at /dev/panels only when import.meta.env.DEV is true.
 *
 * Demonstrates loading, empty, and loaded states with mock Charlotte data.
 * Uses a lightweight SVG heatmap (no Mapbox dependency) so the preview is
 * deterministic and instantly testable.
 */
import { Suspense, lazy, useMemo, useState } from "react";
import { MapPin, Loader2, Inbox } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { Venue } from "@/types/venue";

const JetCard = lazy(() =>
  import("@/components/JetCard").then((m) => ({ default: m.JetCard }))
);

type PanelState = "loading" | "empty" | "loaded";

const MOCK_VENUES: Venue[] = [
  {
    id: "mock-1",
    name: "The Crunkleton",
    lat: 35.2195,
    lng: -80.8418,
    activity: 0.85,
    category: "Bar",
    neighborhood: "South End",
    address: "1957 E 7th St, Charlotte, NC",
    googleRating: 4.6,
    googleTotalRatings: 412,
    isOpen: true,
  },
  {
    id: "mock-2",
    name: "Soul Gastrolounge",
    lat: 35.2168,
    lng: -80.8345,
    activity: 0.62,
    category: "Restaurant",
    neighborhood: "Plaza Midwood",
    address: "1500 Central Ave, Charlotte, NC",
    googleRating: 4.4,
    googleTotalRatings: 1820,
    isOpen: true,
  },
  {
    id: "mock-3",
    name: "Optimist Hall",
    lat: 35.2310,
    lng: -80.8260,
    activity: 0.45,
    category: "Food Hall",
    neighborhood: "Optimist Park",
    address: "1115 N Brevard St, Charlotte, NC",
    googleRating: 4.7,
    googleTotalRatings: 3201,
    isOpen: false,
  },
];

const HeatmapPanel = ({ state, venues }: { state: PanelState; venues: Venue[] }) => {
  // Project lat/lng to a 0-1 viewport for the SVG demo.
  const projected = useMemo(() => {
    if (!venues.length) return [];
    const lats = venues.map((v) => v.lat);
    const lngs = venues.map((v) => v.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const padX = (maxLng - minLng) * 0.2 || 0.01;
    const padY = (maxLat - minLat) * 0.2 || 0.01;
    return venues.map((v) => ({
      ...v,
      x: ((v.lng - (minLng - padX)) / ((maxLng + padX) - (minLng - padX))) * 100,
      // Invert Y so north renders at the top.
      y: 100 - ((v.lat - (minLat - padY)) / ((maxLat + padY) - (minLat - padY))) * 100,
    }));
  }, [venues]);

  return (
    <Card className="relative overflow-hidden h-[420px] bg-card border-border">
      <div className="absolute top-3 left-3 z-10 px-2 py-1 rounded-md bg-background/70 backdrop-blur text-xs font-medium text-foreground">
        Heatmap preview
      </div>

      {state === "loading" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground" aria-live="polite" aria-busy="true">
          <MapPin className="h-8 w-8 animate-pulse text-primary" />
          <span className="text-sm">Loading activity…</span>
        </div>
      )}

      {state === "empty" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-6 text-muted-foreground">
          <Inbox className="h-8 w-8" />
          <span className="text-sm font-medium text-foreground">No activity yet</span>
          <span className="text-xs">Once venues report data, you'll see hotspots here.</span>
        </div>
      )}

      {state === "loaded" && (
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="xMidYMid slice"
          className="absolute inset-0 w-full h-full"
          role="img"
          aria-label="Mock heatmap of Charlotte venues"
        >
          <defs>
            {projected.map((v) => (
              <radialGradient key={`g-${v.id}`} id={`g-${v.id}`}>
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.7 * v.activity + 0.3} />
                <stop offset="60%" stopColor="hsl(var(--primary))" stopOpacity={0.15} />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </radialGradient>
            ))}
          </defs>
          <rect width="100" height="100" fill="hsl(var(--muted) / 0.3)" />
          {projected.map((v) => (
            <circle
              key={v.id}
              cx={v.x}
              cy={v.y}
              r={6 + v.activity * 12}
              fill={`url(#g-${v.id})`}
            />
          ))}
          {projected.map((v) => (
            <circle
              key={`p-${v.id}`}
              cx={v.x}
              cy={v.y}
              r={1.2}
              fill="hsl(var(--primary))"
            />
          ))}
        </svg>
      )}
    </Card>
  );
};

const JetCardPanel = ({ state, venue }: { state: PanelState; venue: Venue | null }) => {
  return (
    <Card className="relative overflow-hidden h-[420px] bg-card border-border p-0">
      <div className="absolute top-3 left-3 z-10 px-2 py-1 rounded-md bg-background/70 backdrop-blur text-xs font-medium text-foreground">
        JetCard preview
      </div>

      {state === "loading" && (
        <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground" aria-live="polite" aria-busy="true">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="text-sm">Loading venue…</span>
        </div>
      )}

      {state === "empty" && (
        <div className="h-full flex flex-col items-center justify-center gap-2 text-center px-6 text-muted-foreground">
          <Inbox className="h-8 w-8" />
          <span className="text-sm font-medium text-foreground">No venue selected</span>
          <span className="text-xs">Tap a hotspot to see venue details.</span>
        </div>
      )}

      {state === "loaded" && venue && (
        <div className="h-full overflow-auto pt-12 px-3 pb-3">
          <Suspense fallback={
            <div className="h-full flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          }>
            <JetCard
              venue={venue}
              onGetDirections={() => {}}
              onClose={() => {}}
              onSendToFriend={() => {}}
            />
          </Suspense>
        </div>
      )}
    </Card>
  );
};

export default function PanelsQA() {
  const [state, setState] = useState<PanelState>("loaded");

  const venues = state === "loaded" ? MOCK_VENUES : [];
  const featuredVenue = state === "loaded" ? MOCK_VENUES[0] : null;

  return (
    <div className="min-h-screen bg-background p-6 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold text-foreground">Panels QA</h1>
          <p className="text-sm text-muted-foreground">
            Heatmap + JetCard preview with mock Charlotte data. Toggle states to verify loading / empty / loaded UI.
          </p>
        </header>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Panel state">
          {(["loading", "empty", "loaded"] as const).map((s) => (
            <Button
              key={s}
              variant={state === s ? "default" : "outline"}
              size="sm"
              onClick={() => setState(s)}
              aria-pressed={state === s}
            >
              {s}
            </Button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <HeatmapPanel state={state} venues={venues} />
          <JetCardPanel state={state} venue={featuredVenue} />
        </div>

        <Card className="p-4 text-xs text-muted-foreground">
          Mock data: {MOCK_VENUES.length} venues across South End, Plaza Midwood, and Optimist Park.
          The heatmap uses an SVG renderer (no Mapbox) so the preview is deterministic.
        </Card>
      </div>
    </div>
  );
}
