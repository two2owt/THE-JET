import { Loader2, MapPin, Route as RouteIcon } from "lucide-react";
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
  /** Coordinates of the busiest grid cell in the current view. */
  topHotspot?: { lng: number; lat: number; density: number } | null;
  /** Highest-frequency movement path in the current view. */
  topRoute?: { frequency: number } | null;
  /** Fly the map to `topHotspot`. */
  onJumpToHotspot?: () => void;
  /** Temporarily highlight `topRoute` on the map. */
  onHighlightTopRoute?: () => void;
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
  topHotspot,
  topRoute,
  onJumpToHotspot,
  onHighlightTopRoute,
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
    fontSize: "var(--live-stats-label-size)",
    color: "hsl(var(--muted-foreground))",
    lineHeight: 1.2,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };
  const valueStyle: React.CSSProperties = {
    fontSize: "var(--live-stats-value-size)",
    fontWeight: 700,
    lineHeight: 1.1,
    fontVariantNumeric: "tabular-nums",
    flexShrink: 0,
  };

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
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--live-stats-gap)" }}>
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
          className="font-display live-stats-vibe"
          style={{
            fontSize: "var(--live-stats-vibe-size)",
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
                gap: "var(--live-stats-row-gap)",
              }}
            >
              <span
                className="animate-pulse live-stats-label"
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
                gap: "var(--live-stats-row-gap)",
              }}
            >
              <span className="live-stats-label" style={labelStyle}>{row.label}</span>
              <span style={{ ...valueStyle, color: row.tone }}>{row.value}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="live-stats-label" style={labelStyle}>
          No live activity in view yet.
        </p>
      )}

      {/* Quick actions — jump to hotspot / highlight top route. */}
      {!isLoading && (topHotspot || topRoute) && (onJumpToHotspot || onHighlightTopRoute) && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "6px",
            paddingTop: "6px",
            borderTop: "1px solid hsl(var(--border) / 0.4)",
          }}
        >
          {topHotspot && onJumpToHotspot && (
            <QuickAction
              icon={<MapPin style={{ width: 11, height: 11 }} strokeWidth={2.5} />}
              label="Top hotspot"
              hint={`${topHotspot.density}`}
              onClick={onJumpToHotspot}
              ariaLabel={`Jump to the busiest hotspot with ${topHotspot.density} check-ins`}
            />
          )}
          {topRoute && onHighlightTopRoute && (
            <QuickAction
              icon={<RouteIcon style={{ width: 11, height: 11 }} strokeWidth={2.5} />}
              label="Top route"
              hint={`${topRoute.frequency}`}
              onClick={onHighlightTopRoute}
              ariaLabel={`Highlight the busiest route with frequency ${topRoute.frequency}`}
            />
          )}
        </div>
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

const QuickAction = ({
  icon,
  label,
  hint,
  onClick,
  ariaLabel,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  onClick: () => void;
  ariaLabel: string;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={ariaLabel}
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: "5px",
      padding: "5px 8px",
      borderRadius: "8px",
      border: "1px solid hsl(var(--primary) / 0.35)",
      background:
        "linear-gradient(135deg, hsl(var(--primary) / 0.15), hsl(var(--primary-glow) / 0.1))",
      color: "hsl(var(--foreground))",
      fontSize: "10px",
      fontWeight: 700,
      letterSpacing: "0.02em",
      cursor: "pointer",
      transition: "background 180ms ease, border-color 180ms ease, transform 120ms ease",
      lineHeight: 1,
      minHeight: "26px",
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.background =
        "linear-gradient(135deg, hsl(var(--primary) / 0.28), hsl(var(--primary-glow) / 0.2))";
      e.currentTarget.style.borderColor = "hsl(var(--primary) / 0.6)";
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.background =
        "linear-gradient(135deg, hsl(var(--primary) / 0.15), hsl(var(--primary-glow) / 0.1))";
      e.currentTarget.style.borderColor = "hsl(var(--primary) / 0.35)";
    }}
  >
    <span style={{ color: "hsl(var(--primary))" }}>{icon}</span>
    {label}
    <span
      style={{
        marginLeft: 2,
        padding: "1px 5px",
        borderRadius: "9999px",
        background: "hsl(var(--primary) / 0.25)",
        color: "hsl(var(--primary))",
        fontSize: "9px",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {hint}
    </span>
  </button>
);

