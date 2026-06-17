import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

interface HeaderSyncIndicatorProps {
  lastUpdated: Date | null | undefined;
  onRefresh?: () => void;
  isLoading?: boolean;
  mounted: boolean;
}

function formatRelative(date: Date): string {
  const diffSec = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (diffSec < 5) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const m = Math.floor(diffSec / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

/**
 * Compact sync indicator rendered between the header search bar and the user
 * avatar. Shows "Updated Xs ago" with a refresh button that re-triggers the
 * page's `onRefresh` handler from HeaderContext.
 */
export function HeaderSyncIndicator({
  lastUpdated,
  onRefresh,
  isLoading,
  mounted,
}: HeaderSyncIndicatorProps) {
  // Tick every 15s so the relative timestamp stays fresh without thrashing.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!lastUpdated) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 15000);
    return () => window.clearInterval(id);
  }, [lastUpdated]);

  if (!lastUpdated && !onRefresh) return null;

  const label = lastUpdated ? `Updated ${formatRelative(lastUpdated)}` : "Sync";
  const title = lastUpdated
    ? `Last updated ${lastUpdated.toLocaleTimeString()} — click to refresh`
    : "Refresh";

  return (
    <button
      type="button"
      onClick={onRefresh}
      disabled={!onRefresh || isLoading}
      aria-label={title}
      title={title}
      style={{
        flexShrink: 0,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        height: "clamp(30px, 4.4vw, 36px)",
        padding: "0 10px",
        borderRadius: 9999,
        border: "1px solid hsl(var(--border) / 0.5)",
        background: "hsl(var(--muted) / 0.3)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        color: "hsl(var(--muted-foreground))",
        fontSize: 12,
        lineHeight: 1,
        whiteSpace: "nowrap",
        cursor: onRefresh ? "pointer" : "default",
        opacity: mounted ? (isLoading ? 0.75 : 1) : 0,
        transform: mounted ? "translateY(0)" : "translateY(-4px)",
        transition:
          "opacity 0.3s ease-out 0.1s, transform 0.3s ease-out 0.1s, background 0.2s, border-color 0.2s",
      }}
      onMouseEnter={(e) => {
        if (!onRefresh || isLoading) return;
        e.currentTarget.style.background = "hsl(var(--muted) / 0.5)";
        e.currentTarget.style.borderColor = "hsl(var(--gold) / 0.4)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "hsl(var(--muted) / 0.3)";
        e.currentTarget.style.borderColor = "hsl(var(--border) / 0.5)";
      }}
    >
      <RefreshCw
        size={12}
        style={{
          animation: isLoading ? "spin 1s linear infinite" : undefined,
          color: "hsl(var(--gold) / 0.9)",
        }}
      />
      <span
        className="hidden sm:inline"
        style={{ fontWeight: 500 }}
      >
        {label}
      </span>
    </button>
  );
}