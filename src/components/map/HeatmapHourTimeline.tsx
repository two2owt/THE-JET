import { memo, useMemo } from "react";
import { Activity, Flame, Moon, Sun, Sunrise, Sunset } from "lucide-react";
import { Timeline, TimelineItem, TimelineStatus } from "@/components/timeline/Timeline";

interface HourlyDatum {
  hour: number;
  stats: { total_points: number; grid_cells: number; max_density: number; avg_density: number };
}

interface HeatmapHourTimelineProps {
  hourlyData: HourlyDatum[];
  currentHour: number;
  onSelectHour: (hour: number) => void;
  formatHour: (hour: number) => string;
  loading?: boolean;
  error?: string | null;
}

const iconForHour = (hour: number) => {
  if (hour < 6) return Moon;
  if (hour < 9) return Sunrise;
  if (hour < 17) return Sun;
  if (hour < 21) return Sunset;
  return Moon;
};

/**
 * Chronological 24-hour scrubber for the heatmap time-lapse, rendered as a
 * horizontal timeline: nodes on a 2px connector line, labels beneath, the
 * playhead hour highlighted as `current`, hours already played as
 * `completed`, and hours with no density data left `upcoming`/muted.
 */
const HeatmapHourTimelineImpl = ({
  hourlyData,
  currentHour,
  onSelectHour,
  formatHour,
  loading,
  error,
}: HeatmapHourTimelineProps) => {
  const items = useMemo<TimelineItem[]>(() => {
    const byHour = new Map(hourlyData.map((d) => [d.hour, d]));
    const peak = Math.max(1, ...hourlyData.map((d) => d.stats?.total_points ?? 0));

    return Array.from({ length: 24 }, (_, hour) => {
      const datum = byHour.get(hour);
      const points = datum?.stats?.total_points ?? 0;
      const isPeak = points > 0 && points >= peak;
      let status: TimelineStatus = "upcoming";
      if (error) status = "error";
      else if (hour === currentHour) status = "current";
      else if (points > 0) status = "completed";

      return {
        id: String(hour),
        title: `${hour % 12 || 12}${hour < 12 ? "a" : "p"}`,
        timestamp: points > 0 ? points.toLocaleString() : "—",
        description: `${formatHour(hour)} · ${points.toLocaleString()} pings`,
        status,
        icon: isPeak ? Flame : hour === currentHour ? Activity : iconForHour(hour),
        type: hour < 6 || hour >= 21 ? "Night" : hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : "Evening",
      } satisfies TimelineItem;
    });
  }, [hourlyData, currentHour, error, formatHour]);

  return (
    <div className="w-full min-w-0" aria-busy={loading}>
      <Timeline
        items={items}
        orientation="horizontal"
        activeId={String(currentHour)}
        onSelect={(id) => onSelectHour(Number(id))}
        ariaLabel="Hourly density time-lapse timeline"
        compact
      />
    </div>
  );
};

export const HeatmapHourTimeline = memo(HeatmapHourTimelineImpl);
HeatmapHourTimeline.displayName = "HeatmapHourTimeline";