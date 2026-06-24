import { useEffect, useState } from "react";

interface LiveStatsPanelProps {
  /** Single source of truth for whether the panel is open. */
  open: boolean;
  mapLoaded: boolean;
  isMobile: boolean;
  densityData: {
    stats: {
      grid_cells: number;
      total_points: number;
      max_density: number;
    };
  } | null;
  pathData: {
    stats: {
      total_paths: number;
      unique_users: number;
    };
  } | null;
  showDensityLayer: boolean;
  showMovementPaths: boolean;
}

/**
 * Live Stats panel for the map.
 *
 * `open` is the single source of truth for the panel's visibility. The
 * component keeps itself mounted for a short delay after `open` becomes false
 * so the opacity fade-out transition can complete before unmounting.
 */
export const LiveStatsPanel = ({
  open,
  mapLoaded,
  isMobile,
  densityData,
  pathData,
  showDensityLayer,
  showMovementPaths,
}: LiveStatsPanelProps) => {
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
    } else {
      const timer = setTimeout(() => setMounted(false), 300);
      return () => clearTimeout(timer);
    }
  }, [open]);

  if (!mounted) return null;

  const grid = densityData?.stats.grid_cells ?? 0;
  const checkins = densityData?.stats.total_points ?? 0;
  const peakDensity = densityData?.stats.max_density ?? 0;
  const routes = pathData?.stats.total_paths ?? 0;
  const people = pathData?.stats.unique_users ?? 0;

  const vibe =
    grid >= 40 || peakDensity >= 25
      ? { label: "Buzzing right now", dot: "hsl(0, 100%, 65%)" }
      : grid >= 15 || peakDensity >= 8
        ? { label: "Picking up nearby", dot: "hsl(45, 100%, 60%)" }
        : grid > 0 || routes > 0
          ? { label: "Quiet out there", dot: "hsl(200, 100%, 65%)" }
          : { label: "Live activity", dot: "hsl(var(--muted-foreground))" };

  const labelStyle: React.CSSProperties = {
    fontSize: "11px",
    color: "hsl(var(--muted-foreground))",
    lineHeight: 1.2,
  };
  const valueStyle: React.CSSProperties = {
    fontSize: "13px",
    fontWeight: 700,
    lineHeight: 1.1,
    fontVariantNumeric: "tabular-nums",
  };

  type Row = { key: string; label: string; value: string; tone: string };
  const rows: Row[] = [];
  if (showDensityLayer && densityData) {
    if (grid > 0)
      rows.push({
        key: "hotspots",
        label: "Active hotspots",
        value: grid.toLocaleString(),
        tone: "hsl(var(--primary))",
      });
    if (checkins > 0)
      rows.push({
        key: "checkins",
        label: "Recent check-ins",
        value: checkins.toLocaleString(),
        tone: "hsl(var(--foreground))",
      });
  }
  if (showMovementPaths && pathData) {
    if (people > 0)
      rows.push({
        key: "people",
        label: "People on the move",
        value: people.toLocaleString(),
        tone: "hsl(200, 100%, 65%)",
      });
    if (routes > 0)
      rows.push({
        key: "routes",
        label: "Popular routes",
        value: routes.toLocaleString(),
        tone: "hsl(var(--primary))",
      });
  }

  return (
    <div
      style={{
        position: "absolute",
        top: "calc(var(--map-safe-top-controls-in-map, var(--map-safe-top-controls)) + 1rem)",
        right: "var(--map-ui-inset-right)",
        minWidth: isMobile ? "160px" : "180px",
        maxWidth: isMobile
          ? "calc(100vw - 1.5rem - var(--map-ui-inset-right, 0.75rem))"
          : "240px",
        zIndex: 30,
        background: "hsl(var(--card))",
        backdropFilter: "blur(24px) saturate(1.6)",
        WebkitBackdropFilter: "blur(24px) saturate(1.6)",
        borderRadius: "12px",
        border: "1px solid hsl(var(--border))",
        boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)",
        padding: isMobile ? "10px 12px" : "10px 14px",
        opacity: open && mapLoaded ? 1 : 0,
        visibility: open && mapLoaded ? "visible" : "hidden",
        transition: "opacity 300ms ease-out, visibility 300ms ease-out",
        transform: "translateZ(0)",
        willChange: "opacity",
        pointerEvents: open && mapLoaded ? "auto" : "none",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span
            aria-hidden="true"
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "9999px",
              background: vibe.dot,
              boxShadow: `0 0 8px ${vibe.dot}`,
            }}
          />
          <p
            className="font-display"
            style={{
              fontSize: "11px",
              fontWeight: 700,
              color: "hsl(var(--foreground))",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            {vibe.label}
          </p>
        </div>

        {rows.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
            {rows.map((row) => (
              <div
                key={row.key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "12px",
                }}
              >
                <span style={labelStyle}>{row.label}</span>
                <span style={{ ...valueStyle, color: row.tone }}>{row.value}</span>
              </div>
            ))}
          </div>
        ) : (
          <p style={labelStyle}>No live activity in view yet.</p>
        )}
      </div>
    </div>
  );
};
