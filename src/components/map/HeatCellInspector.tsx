import { X, Activity, MapPin, Users, Crosshair } from "lucide-react";
import { activityTier } from "@/lib/activity-palette";
import { triggerHaptic } from "@/lib/haptics";

export interface HeatCell {
  lat: number;
  lng: number;
  /** Distinct recent users aggregated into this grid cell. */
  density: number;
  /** 0-1 normalized intensity from the density endpoint. */
  intensity: number;
}

interface HeatCellInspectorProps {
  cell: HeatCell | null;
  cityLabel?: string;
  isLightBasemap?: boolean;
  onClose: () => void;
  onZoomTo?: (cell: HeatCell) => void;
}

/**
 * Tap-to-inspect detail card for a single heatmap grid cell. Shows the JET
 * intensity tier, the number of people feeding the cell, and its location.
 */
export const HeatCellInspector = ({
  cell,
  cityLabel,
  isLightBasemap = false,
  onClose,
  onZoomTo,
}: HeatCellInspectorProps) => {
  if (!cell) return null;

  const score = Math.round(Math.min(1, Math.max(0, cell.intensity)) * 100);
  const tier = activityTier(score);
  const tierColor = isLightBasemap ? tier.light : tier.dark;

  return (
    <div
      role="dialog"
      aria-label="Heat cell details"
      className="absolute left-1/2 -translate-x-1/2 w-[min(420px,calc(100%-24px))] rounded-2xl p-3 pointer-events-auto"
      style={{
        bottom: "calc(var(--map-ui-inset-bottom, 1rem) + 8px)",
        zIndex: 35,
        background: "hsl(var(--card) / 0.82)",
        border: "1px solid hsl(var(--border) / 0.6)",
        backdropFilter: "blur(18px) saturate(1.5)",
        WebkitBackdropFilter: "blur(18px) saturate(1.5)",
        boxShadow: "0 18px 44px -20px hsl(0 0% 0% / 0.7)",
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex items-center justify-center rounded-xl flex-shrink-0"
          style={{
            width: "40px",
            height: "40px",
            background: `${tierColor}22`,
            border: `1px solid ${tierColor}66`,
          }}
        >
          <Activity className="w-5 h-5" style={{ color: tierColor }} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="font-display text-sm font-bold"
              style={{ color: tierColor }}
            >
              {tier.label} zone
            </span>
            <span className="text-[11px] font-semibold text-muted-foreground">
              JET intensity {score}%
            </span>
          </div>

          <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
            <span className="inline-flex items-center gap-1">
              <Users className="w-3 h-3" />
              {cell.density} {cell.density === 1 ? "person" : "people"} nearby
            </span>
            <span className="inline-flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {cityLabel ? `${cityLabel} · ` : ""}
              {cell.lat.toFixed(4)}, {cell.lng.toFixed(4)}
            </span>
          </div>

          <div
            className="mt-2 h-1.5 w-full rounded-full overflow-hidden"
            style={{ background: "hsl(var(--muted) / 0.5)" }}
            aria-hidden="true"
          >
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${Math.max(4, score)}%`, background: tierColor }}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close heat cell details"
            className="flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground transition-colors"
            style={{ width: "32px", height: "32px" }}
          >
            <X className="w-4 h-4" />
          </button>
          {onZoomTo && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic("light");
                onZoomTo(cell);
              }}
              aria-label="Zoom to this heat cell"
              className="flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground transition-colors"
              style={{ width: "32px", height: "32px" }}
            >
              <Crosshair className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
