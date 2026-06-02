import { LucideIcon } from "lucide-react";
import { Switch } from "@/components/ui/switch";

interface LayerToggleRowProps {
  label: string;
  active: boolean;
  Icon: LucideIcon;
  ariaLabel: string;
  onToggle: () => void;
}

/**
 * Single layer toggle row used inside the map's Layers panel.
 *
 * Renders as `div role="button"` (not `<button>`) so the inner Radix
 * `<Switch>` — which itself renders a `<button>` — does not produce
 * an invalid button-in-button DOM nesting warning.
 */
export const LayerToggleRow = ({
  label,
  active,
  Icon,
  ariaLabel,
  onToggle,
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
      onClick={onToggle}
      onKeyDown={handleKeyDown}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "8px",
        borderRadius: "8px",
        fontSize: "11px",
        fontWeight: 600,
        transition: "all 0.2s",
        cursor: "pointer",
        userSelect: "none",
        border: active
          ? "1px solid hsl(var(--primary) / 0.3)"
          : "1px solid transparent",
        background: active
          ? "hsl(var(--primary) / 0.15)"
          : "hsl(var(--secondary) / 0.3)",
        color: active ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
      }}
    >
      <div
        style={{
          width: "24px",
          height: "24px",
          borderRadius: "6px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: active
            ? "hsl(var(--primary))"
            : "hsl(var(--muted-foreground) / 0.12)",
          color: active
            ? "hsl(var(--primary-foreground))"
            : "hsl(var(--muted-foreground))",
          transition: "background 0.2s, color 0.2s",
        }}
      >
        <Icon style={{ width: "14px", height: "14px" }} />
      </div>
      <span>{label}</span>
      <Switch
        checked={active}
        tabIndex={-1}
        aria-hidden="true"
        style={{ marginLeft: "auto", pointerEvents: "none" }}
      />
    </div>
  );
};