import { LucideIcon, Loader2, HelpCircle } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

interface LayerToggleRowProps {
  label: string;
  active: boolean;
  Icon: LucideIcon;
  ariaLabel: string;
  onToggle: () => void;
  loading?: boolean;
  /** Optional helper text explaining what the layer shows. */
  tooltip?: string;
}

/**
 * Single layer toggle row used inside the map's Layers panel.
 *
 * Tap-to-toggle pill with a glassmorphic Dark Luxe finish — no nested
 * Switch control. Active state uses the JET primary→primary-glow gradient
 * with a soft outer glow; inactive state is a subtle hairline-bordered
 * glass row. A small status dot replaces the previous Switch so the row
 * never reads as two stacked toggles. A help icon next to each row shows a
 * tooltip explaining what the layer displays and how live stats are computed.
 */
export const LayerToggleRow = ({
  label,
  active,
  Icon,
  ariaLabel,
  onToggle,
  loading,
  tooltip,
}: LayerToggleRowProps) => {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onToggle();
    }
  };

  return (
    <div
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
        gap: "clamp(10px, 2.2vw, 12px)",
        padding: "clamp(10px, 2.4vw, 12px) clamp(10px, 2.6vw, 14px)",
        minHeight: "44px",
        borderRadius: "12px",
        fontSize: "clamp(11px, 2.6vw, 13px)",
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
          width: "clamp(26px, 6vw, 30px)",
          height: "clamp(26px, 6vw, 30px)",
          borderRadius: "9px",
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
        <Icon
          style={{ width: "clamp(14px, 3.4vw, 16px)", height: "clamp(14px, 3.4vw, 16px)" }}
          strokeWidth={2.25}
        />
      </div>
      <span
        className="font-display"
        style={{
          flex: 1,
          textAlign: "left",
          fontSize: "clamp(12px, 2.8vw, 14px)",
          fontWeight: 700,
          letterSpacing: "-0.005em",
          color: active ? "hsl(var(--foreground))" : "hsl(var(--foreground) / 0.75)",
        }}
      >
        {label}
      </span>

      {/* Help tooltip — isolated from the row toggle so tapping it doesn't switch the layer. */}
      {tooltip && (
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={`${label} help`}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "24px",
                height: "24px",
                borderRadius: "6px",
                flexShrink: 0,
                background: "transparent",
                border: "1px solid transparent",
                color: "hsl(var(--muted-foreground) / 0.7)",
                cursor: "pointer",
                transition: "color 150ms ease, background 150ms ease, border-color 150ms ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "hsl(var(--foreground))";
                e.currentTarget.style.background = "hsl(var(--primary) / 0.1)";
                e.currentTarget.style.borderColor = "hsl(var(--border) / 0.6)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "hsl(var(--muted-foreground) / 0.7)";
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.borderColor = "transparent";
              }}
            >
              <HelpCircle style={{ width: "13px", height: "13px" }} strokeWidth={2.25} />
            </button>
          </TooltipTrigger>
          <TooltipContent
            side="left"
            align="center"
            sideOffset={8}
            style={{
              maxWidth: "220px",
              fontSize: "11px",
              lineHeight: 1.45,
              padding: "8px 10px",
            }}
          >
            {tooltip}
          </TooltipContent>
        </Tooltip>
      )}

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
