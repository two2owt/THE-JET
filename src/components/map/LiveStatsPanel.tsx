import { Loader2 } from "lucide-react";
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
  densityLoading?: boolean;
  pathLoading?: boolean;
  /** "floating" (default) renders the standalone panel; "inline" renders just the content for embedding. */
  variant?: "floating" | "inline";
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
  densityLoading,
  pathLoading,
  variant = "floating",
}: LiveStatsPanelProps) => {
  // Props kept for backwards compatibility — live activity now renders
  // regardless of which layers are toggled on.
  void showDensityLayer;
  void showMovementPaths;
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
    } else {
      const timer = setTimeout(() => setMounted(false), 300);
      return () => clearTimeout(timer);
    }
  }, [open]);

  if (!mounted && variant === "floating") return null;
  if (variant === "inline" && !open) return null;

  const grid = densityData?.stats.grid_cells ?? 0;
  const checkins = densityData?.stats.total_points ?? 0;
  const peakDensity = densityData?.stats.max_density ?? 0;
  const routes = pathData?.stats.total_paths ?? 0;
  const people = pathData?.stats.unique_users ?? 0;

  const isLoading = densityLoading || pathLoading;

  const vibe = isLoading
    ? { label: "Updating live stats", dot: "hsl(var(--primary))" }
    : grid >= 40 || peakDensity >= 25
      ? { label: "Buzzing right now", dot: "hsl(0, 100%, 65%)" }
      : grid >= 15 || peakDensity >= 8
        ? { label: "Picking up nearby", dot: "hsl(45, 100%, 60%)" }
        : grid > 0 || routes > 0
          ? { label: "Quiet out there", dot: "hsl(200, 100%, 65%)" }
          : { label: "Live activity", dot: "hsl(var(--muted-foreground))" };

  const labelStyle: React.CSSProperties = {
    fontSize: isMobile ? "10px" : "11px",
    color: "hsl(var(--muted-foreground))",
    lineHeight: 1.2,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };
  const valueStyle: React.CSSProperties = {
    fontSize: isMobile ? "11px" : "13px",
    fontWeight: 700,
    lineHeight: 1.1,
    fontVariantNumeric: "tabular-nums",
    flexShrink: 0,
  };
  const rowGap = isMobile ? "8px" : "12px";

  type Row = { key: string; label: string; value: string; tone: string };
  const rows: Row[] = [];
  if (densityData) {
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
  if (pathData) {
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

  const content = (
    <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? "6px" : "8px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        {isLoading ? (
          <Loader2
            aria-hidden="true"
            className="animate-spin"
            style={{ width: "8px", height: "8px", color: "hsl(var(--primary))" }}
          />
        ) : (
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
        )}
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

      {isLoading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
          {[0, 1].map((i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: rowGap,
              }}
            >
              <span
                className="animate-pulse"
                style={{
                  ...labelStyle,
                  width: "45%",
                  height: "10px",
                  borderRadius: "4px",
                  background: "hsl(var(--muted-foreground) / 0.25)",
                }}
              />
              <span
                className="animate-pulse"
                style={{
                  ...valueStyle,
                  width: "20%",
                  height: "10px",
                  borderRadius: "4px",
                  background: "hsl(var(--primary) / 0.25)",
                }}
              />
            </div>
          ))}
        </div>
      ) : rows.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
          {rows.map((row) => (
            <div
              key={row.key}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: rowGap,
              }}
            >
              <span style={labelStyle}>{row.label}</span>
              <span style={{ ...valueStyle, color: row.tone }}>{row.value}</span>
            </div>
          ))}
        </div>
      ) : (
        <p style={labelStyle}>
          No live activity in view yet.
        </p>
      )}
    </div>
  );

  if (variant === "inline") {
    return content;
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
      {content}
    </div>
  );
};

