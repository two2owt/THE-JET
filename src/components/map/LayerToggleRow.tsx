import { LucideIcon, Loader2 } from "lucide-react";

interface LayerToggleRowProps {
  label: string;
  active: boolean;
  Icon: LucideIcon;
  ariaLabel: string;
  onToggle: () => void;
  loading?: boolean;
}

/**
 * Single layer toggle row used inside the map's Layers panel.
 *
 * Tap-to-toggle pill with a glassmorphic Dark Luxe finish — no nested
 * Switch control. Active state uses the JET primary→primary-glow gradient
 * with a soft outer glow; inactive state is a subtle hairline-bordered
 * glass row. A small status dot replaces the previous Switch so the row
 * never reads as two stacked toggles.
 */
export const LayerToggleRow = ({
  label,
  active,
  Icon,
  ariaLabel,
  onToggle,
  loading,
}: LayerToggleRowProps) => {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onToggle();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={active}
      aria-label={ariaLabel}
      aria-busy={loading}
      onClick={onToggle}
      onKeyDown={handleKeyDown}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "8px 10px",
        borderRadius: "10px",
        fontSize: "11px",
        fontWeight: 600,
        letterSpacing: "0.01em",
        transition:
          "background 220ms cubic-bezier(0.16,1,0.3,1), border-color 220ms ease, box-shadow 220ms ease, color 220ms ease",
        cursor: loading ? "wait" : "pointer",
        userSelect: "none",
        border: active
          ? "1px solid hsl(var(--primary) / 0.45)"
          : "1px solid hsl(var(--border) / 0.5)",
        background: active
          ? "linear-gradient(135deg, hsl(var(--primary) / 0.18), hsl(var(--primary-glow) / 0.14))"
          : "hsl(var(--card) / 0.5)",
        backdropFilter: "blur(12px) saturate(1.4)",
        WebkitBackdropFilter: "blur(12px) saturate(1.4)",
        boxShadow: active
          ? "0 8px 24px -10px hsl(var(--primary) / 0.55), inset 0 0 0 1px hsl(var(--primary-glow) / 0.18)"
          : "inset 0 0 0 1px hsl(0 0% 100% / 0.03)",
        color: active ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))",
        opacity: loading ? 0.85 : 1,
      }}
    >
      <div
        style={{
          width: "26px",
          height: "26px",
          borderRadius: "8px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          background: active
            ? "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary-glow)))"
            : "hsl(var(--background) / 0.6)",
          color: active
            ? "hsl(var(--primary-foreground))"
            : "hsl(var(--muted-foreground))",
          border: active
            ? "1px solid transparent"
            : "1px solid hsl(var(--border) / 0.6)",
          boxShadow: active
            ? "0 4px 12px -4px hsl(var(--primary) / 0.6)"
            : "none",
          transition: "background 220ms ease, color 220ms ease, box-shadow 220ms ease",
        }}
      >
        <Icon style={{ width: "14px", height: "14px" }} strokeWidth={2.25} />
      </div>
      <span
        className="font-display"
        style={{
          flex: 1,
          textAlign: "left",
          fontSize: "12px",
          fontWeight: 700,
          letterSpacing: "-0.005em",
          color: active ? "hsl(var(--foreground))" : "hsl(var(--foreground) / 0.75)",
        }}
      >
        {label}
      </span>
      {/* Status dot / loading spinner */}
      {loading ? (
        <Loader2
          aria-hidden="true"
          className="animate-spin"
          style={{
            width: "14px",
            height: "14px",
            flexShrink: 0,
            color: "hsl(var(--primary))",
          }}
        />
      ) : (
        <span
          aria-hidden="true"
          style={{
            width: "8px",
            height: "8px",
            borderRadius: "9999px",
            flexShrink: 0,
            background: active
              ? "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary-glow)))"
              : "hsl(var(--muted-foreground) / 0.25)",
            boxShadow: active
              ? "0 0 10px hsl(var(--primary) / 0.7), 0 0 2px hsl(var(--primary-glow) / 0.6)"
              : "inset 0 0 0 1px hsl(var(--border))",
            transition: "background 220ms ease, box-shadow 220ms ease",
          }}
        />
      )}
    </div>
  );
};
