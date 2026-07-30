import { memo, useMemo } from "react";
import { Footprints, Route, TrendingUp, Users, Zap } from "lucide-react";
import { Timeline, TimelineItem, TimelineStatus } from "@/components/timeline/Timeline";

interface FlowPathsTimelineProps {
  geojson?: { features?: Array<{ properties?: { frequency?: number } }> } | null;
  stats?: { total_paths: number; total_movements: number; unique_users: number; max_frequency: number; avg_frequency: number } | null;
  /** Current min-frequency filter — bands below it read as filtered out. */
  minFrequency: number;
  onSelectBand?: (minFrequency: number) => void;
  error?: boolean;
}

const BANDS: Array<{ id: string; label: string; min: number; max: number; icon: typeof Route; type: string }> = [
  { id: "1", label: "Casual", min: 1, max: 2, icon: Footprints, type: "Low" },
  { id: "3", label: "Steady", min: 3, max: 4, icon: Route, type: "Medium" },
  { id: "5", label: "Busy", min: 5, max: 9, icon: TrendingUp, type: "High" },
  { id: "10", label: "Peak", min: 10, max: Infinity, icon: Zap, type: "High" },
];

/**
 * Movement-frequency chronology for the Flow Paths layer, rendered as a
 * vertical timeline: each node is a motion-frequency band, filled when the
 * band is included by the current Min. frequency filter, muted when filtered
 * out, and highlighted as `current` for the band the filter sits in. Cards
 * expand to show path counts and share of total movement.
 */
const FlowPathsTimelineImpl = ({ geojson, stats, minFrequency, onSelectBand, error }: FlowPathsTimelineProps) => {
  const items = useMemo<TimelineItem[]>(() => {
    const freqs = (geojson?.features ?? [])
      .map((f) => Number(f?.properties?.frequency ?? 0))
      .filter((n) => Number.isFinite(n) && n > 0);
    const total = freqs.length || 0;

    const activeBand = [...BANDS].reverse().find((b) => minFrequency >= b.min)?.id ?? "1";

    return BANDS.map((band) => {
      const count = freqs.filter((f) => f >= band.min && f <= band.max).length;
      const share = total > 0 ? Math.round((count / total) * 100) : 0;
      const included = band.max >= minFrequency;

      let status: TimelineStatus = included ? "completed" : "upcoming";
      if (error) status = "error";
      else if (band.id === activeBand) status = "current";

      return {
        id: band.id,
        title: `${band.label} · ${band.min}${band.max === Infinity ? "+" : `–${band.max}`} trips`,
        timestamp: `${count} path${count === 1 ? "" : "s"}`,
        description: included
          ? `${share}% of visible routes. Thicker, brighter lines on the map mean more people repeating this route.`
          : `Hidden by the Min. frequency filter. Tap to include ${band.min}+ trip routes.`,
        status,
        icon: band.icon,
        type: band.type,
      } satisfies TimelineItem;
    });
  }, [geojson, minFrequency, error]);

  return (
    <div className="w-full min-w-0">
      <Timeline
        items={items}
        orientation="vertical"
        layout="single"
        activeId={[...BANDS].reverse().find((b) => minFrequency >= b.min)?.id}
        onSelect={(id) => onSelectBand?.(Number(id))}
        expandable
        filterable
        compact
        ariaLabel="Movement frequency timeline"
      />
      {stats && (
        <div className="mt-1 flex items-center gap-1.5 text-[9px] text-muted-foreground">
          <Users className="h-2.5 w-2.5" />
          <span>{stats.unique_users} users</span>
          <span>•</span>
          <span>{stats.total_movements.toLocaleString()} movements</span>
          <span>•</span>
          <span>peak {stats.max_frequency}x</span>
        </div>
      )}
    </div>
  );
};

export const FlowPathsTimeline = memo(FlowPathsTimelineImpl);
FlowPathsTimeline.displayName = "FlowPathsTimeline";