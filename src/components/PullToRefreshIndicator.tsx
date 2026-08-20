import { Loader2, ArrowDown } from "lucide-react";

interface Props {
  distance: number;
  refreshing: boolean;
  armed: boolean;
}

/**
 * Glass pill that tracks the pull-to-refresh drag. Purely presentational —
 * gesture state comes from `usePullToRefresh`.
 */
export function PullToRefreshIndicator({ distance, refreshing, armed }: Props) {
  if (distance <= 0 && !refreshing) return null;
  const progress = Math.min(1, distance / 72);
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute left-1/2 top-0 z-30 -translate-x-1/2"
      style={{
        transform: `translate(-50%, ${Math.max(8, distance - 8)}px)`,
        opacity: refreshing ? 1 : progress,
      }}
    >
      <div className="flex items-center gap-2 rounded-full border border-border/60 bg-background/80 px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-lg backdrop-blur-md">
        {refreshing ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
        ) : (
          <ArrowDown
            className="h-3.5 w-3.5 text-primary transition-transform"
            style={{ transform: armed ? "rotate(180deg)" : "none" }}
          />
        )}
        <span>
          {refreshing
            ? "Refreshing…"
            : armed
              ? "Release to refresh"
              : "Pull to refresh"}
        </span>
      </div>
    </div>
  );
}
