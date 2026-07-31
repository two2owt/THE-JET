import { memo } from "react";
import { Flame } from "lucide-react";

/**
 * Compact color-scale legend for the density heatmap, shown inside the
 * Layers panel. Replaces the removed intensity/radius/opacity sliders with a
 * read-only explanation of what the heat colors actually mean, using the same
 * gradient stops as the `location-density-heat` layer's `heatmap-color` ramp.
 */
const HeatmapColorLegendImpl = ({
  loading,
  isLightBasemap = false,
}: {
  loading?: boolean;
  /** Mirrors the `location-density-heat` ramp, which darkens on light basemaps. */
  isLightBasemap?: boolean;
}) => (
  <div
    role="img"
    className={loading ? "layer-pending" : undefined}
    aria-label="Heatmap colors run from blue for quiet areas through green and yellow to red for the busiest areas"
    style={{
      width: "100%",
      minWidth: 0,
      position: "relative",
      display: "flex",
      flexDirection: "column",
      gap: "clamp(5px, 1.4vw, 8px)",
      padding: "clamp(8px, 2vw, 12px) clamp(9px, 2.4vw, 14px)",
      borderRadius: "12px",
      border: "1px solid hsl(var(--border) / 0.5)",
      background: "hsl(var(--card) / 0.5)",
      backdropFilter: "blur(12px) saturate(1.4)",
      WebkitBackdropFilter: "blur(12px) saturate(1.4)",
      boxShadow: "inset 0 0 0 1px hsl(0 0% 100% / 0.03)",
      animation: "content-fade-in 240ms cubic-bezier(0.16,1,0.3,1)",
    }}
  >
    {loading && <span aria-hidden className="layer-loading-bar" />}
    <div style={{ display: "flex", alignItems: "center", gap: "clamp(6px, 1.4vw, 8px)", minWidth: 0 }}>
      <div
        aria-hidden
        style={{
          width: "clamp(22px, 5.4vw, 26px)",
          height: "clamp(22px, 5.4vw, 26px)",
          borderRadius: "8px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          background: "hsl(var(--background) / 0.6)",
          border: "1px solid hsl(var(--border) / 0.6)",
          color: "hsl(var(--muted-foreground))",
        }}
      >
        <Flame style={{ width: "clamp(12px, 3vw, 14px)", height: "clamp(12px, 3vw, 14px)" }} strokeWidth={2.25} />
      </div>
      <span
        className="font-display"
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: "clamp(11px, 2.6vw, 13px)",
          fontWeight: 700,
          letterSpacing: "-0.005em",
          color: "hsl(var(--foreground) / 0.9)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        What the colors mean
      </span>
    </div>

    <div
      aria-hidden
      style={{
        width: "100%",
        height: "10px",
        borderRadius: "9999px",
        background: isLightBasemap
          ? "linear-gradient(to right, rgb(37,62,158), rgb(0,122,194), rgb(0,158,96), rgb(214,184,0), rgb(233,110,0), rgb(190,0,10), rgb(110,0,5))"
          : "linear-gradient(to right, rgba(65,105,225,0.85), rgb(0,191,255), rgb(0,255,127), rgb(255,255,0), rgb(255,165,0), rgb(255,0,0), rgb(139,0,0))",
        border: "1px solid hsl(var(--border) / 0.5)",
        boxShadow: "inset 0 1px 3px rgba(0,0,0,0.35)",
      }}
    />

    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: "4px",
        fontSize: "clamp(9px, 2.2vw, 10px)",
        fontWeight: 600,
        letterSpacing: "0.02em",
        color: "hsl(var(--muted-foreground))",
      }}
    >
      <span>Quiet</span>
      <span>Picking up</span>
      <span>Busy</span>
      <span>Packed</span>
    </div>

    <p
      style={{
        margin: 0,
        fontSize: "clamp(9px, 2.2vw, 10px)",
        lineHeight: 1.4,
        color: "hsl(var(--muted-foreground) / 0.85)",
      }}
    >
      Color shows how many people are checked in nearby. Zoom in past street level to see individual hotspots as dots.
    </p>
  </div>
);

export const HeatmapColorLegend = memo(HeatmapColorLegendImpl);
