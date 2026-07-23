import { memo } from "react";
import { LucideIcon, RotateCcw, Loader2 } from "lucide-react";
import { Slider } from "@/components/ui/slider";

interface LayerSliderRowProps {
  label: string;
  Icon: LucideIcon;
  ariaLabel: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  /** Optional callback fired when the user releases the thumb — use to
   *  trigger a network refresh so drags don't spam the backend. */
  onCommit?: (value: number) => void;
  /** Human-readable value pill shown on the right (e.g. "1.4x", "15m"). */
  format?: (value: number) => string;
  /** Optional reset button that snaps back to `defaultValue`. */
  defaultValue?: number;
  /** Optional snap tick labels rendered under the slider track. */
  ticks?: { value: number; label: string }[];
  disabled?: boolean;
  /** When true, show a spinner in the value pill to indicate a pending
   *  refetch triggered by the slider (e.g. edge-function round-trip). */
  loading?: boolean;
}

/**
 * Glassmorphic slider row for the map Layers panel. Matches the visual
 * language of {@link LayerToggleRow} — same hairline border, gradient tint
 * when the value differs from the default, and a live-value pill on the
 * right. `onCommit` fires once per drag end so paint-only sliders update in
 * real time while data-window sliders only refetch on release.
 */
const LayerSliderRowImpl = ({
  label,
  Icon,
  ariaLabel,
  min,
  max,
  step,
  value,
  onChange,
  onCommit,
  format = (v) => String(v),
  defaultValue,
  ticks,
  disabled,
  loading,
}: LayerSliderRowProps) => {
  const isCustom =
    defaultValue !== undefined && Math.abs(value - defaultValue) > 1e-6;

  return (
    <div
      aria-label={ariaLabel}
      style={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        gap: "clamp(6px, 1.6vw, 10px)",
        padding: "clamp(8px, 2vw, 12px) clamp(9px, 2.4vw, 14px)",
        minWidth: 0,
        borderRadius: "12px",
        border: isCustom
          ? "1px solid hsl(var(--primary) / 0.45)"
          : "1px solid hsl(var(--border) / 0.5)",
        background: isCustom
          ? "linear-gradient(135deg, hsl(var(--primary) / 0.14), hsl(var(--primary-glow) / 0.10))"
          : "hsl(var(--card) / 0.5)",
        backdropFilter: "blur(12px) saturate(1.4)",
        WebkitBackdropFilter: "blur(12px) saturate(1.4)",
        boxShadow: isCustom
          ? "0 8px 24px -12px hsl(var(--primary) / 0.5), inset 0 0 0 1px hsl(var(--primary-glow) / 0.15)"
          : "inset 0 0 0 1px hsl(0 0% 100% / 0.03)",
        opacity: disabled ? 0.55 : 1,
        transition:
          "background 220ms cubic-bezier(0.16,1,0.3,1), border-color 220ms ease, box-shadow 220ms ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "clamp(6px, 1.4vw, 8px)", minWidth: 0, flexWrap: "wrap" }}>
        <div
          style={{
            width: "clamp(22px, 5.4vw, 26px)",
            height: "clamp(22px, 5.4vw, 26px)",
            borderRadius: "8px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            background: isCustom
              ? "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary-glow)))"
              : "hsl(var(--background) / 0.6)",
            color: isCustom
              ? "hsl(var(--primary-foreground))"
              : "hsl(var(--muted-foreground))",
            border: isCustom
              ? "1px solid transparent"
              : "1px solid hsl(var(--border) / 0.6)",
          }}
        >
          <Icon
            style={{ width: "clamp(12px, 3vw, 14px)", height: "clamp(12px, 3vw, 14px)" }}
            strokeWidth={2.25}
          />
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
          {label}
        </span>
        <span
          className="font-display"
          style={{
            fontSize: "clamp(10px, 2.4vw, 12px)",
            fontWeight: 700,
            letterSpacing: "0.02em",
            padding: "3px clamp(7px, 1.8vw, 10px)",
            flexShrink: 0,
            borderRadius: "9999px",
            background: isCustom
              ? "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary-glow)))"
              : "hsl(var(--muted) / 0.4)",
            color: isCustom
              ? "hsl(var(--primary-foreground))"
              : "hsl(var(--muted-foreground))",
            border: isCustom
              ? "1px solid transparent"
              : "1px solid hsl(var(--border) / 0.5)",
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
          }}
          aria-live="polite"
        >
          {loading && (
            <Loader2
              aria-label="Refreshing"
              style={{ width: "9px", height: "9px" }}
              className="animate-spin"
              strokeWidth={2.5}
            />
          )}
          {format(value)}
        </span>
        {defaultValue !== undefined && isCustom && (
          <button
            type="button"
            aria-label={`Reset ${label}`}
            onClick={() => {
              onChange(defaultValue);
              onCommit?.(defaultValue);
            }}
            style={{
              width: "20px",
              height: "20px",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "6px",
              border: "1px solid hsl(var(--border) / 0.6)",
              background: "hsl(var(--background) / 0.6)",
              color: "hsl(var(--muted-foreground))",
              cursor: "pointer",
              padding: 0,
            }}
          >
            <RotateCcw style={{ width: "10px", height: "10px" }} strokeWidth={2.25} />
          </button>
        )}
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onValueChange={([v]) => onChange(v)}
        onValueCommit={([v]) => onCommit?.(v)}
        className="w-full"
        aria-label={ariaLabel}
      />
      {ticks && ticks.length > 0 && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "2px",
            flexWrap: "wrap",
            rowGap: "4px",
            marginTop: "-2px",
            paddingInline: "2px",
          }}
        >
          {ticks.map((t) => {
            const active = Math.abs(value - t.value) < 1e-6;
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => {
                  onChange(t.value);
                  onCommit?.(t.value);
                }}
                style={{
                  fontSize: "clamp(9px, 2vw, 10px)",
                  fontWeight: 700,
                  letterSpacing: "0.02em",
                  padding: "1px clamp(4px, 1.2vw, 6px)",
                  borderRadius: "6px",
                  border: active
                    ? "1px solid transparent"
                    : "1px solid hsl(var(--border) / 0.4)",
                  background: active
                    ? "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary-glow)))"
                    : "transparent",
                  color: active
                    ? "hsl(var(--primary-foreground))"
                    : "hsl(var(--muted-foreground) / 0.85)",
                  cursor: "pointer",
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

/**
 * Memoized to avoid re-renders when unrelated map state changes while the
 * user is dragging a slider — only value/loading/disabled updates should
 * cause a paint of this row.
 */
export const LayerSliderRow = memo(LayerSliderRowImpl);