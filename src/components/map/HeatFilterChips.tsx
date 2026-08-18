import { triggerHaptic } from "@/lib/haptics";

export type HeatTimeFilter = "all" | "this_hour" | "today" | "this_week";

const OPTIONS: Array<{ id: HeatTimeFilter; label: string }> = [
  { id: "this_hour", label: "Live" },
  { id: "today", label: "Today" },
  { id: "this_week", label: "Week" },
  { id: "all", label: "All" },
];

interface HeatFilterChipsProps {
  value: HeatTimeFilter;
  onChange: (value: HeatTimeFilter) => void;
  loading?: boolean;
}

/** Compact heatmap time filters surfaced directly on the map (mobile first). */
export const HeatFilterChips = ({
  value,
  onChange,
  loading,
}: HeatFilterChipsProps) => (
  <div
    role="group"
    aria-label="Heatmap time filter"
    className="flex items-center gap-1 rounded-full p-1 pointer-events-auto"
    style={{
      background: "hsl(var(--card) / 0.7)",
      border: "1px solid hsl(var(--border) / 0.55)",
      backdropFilter: "blur(14px) saturate(1.4)",
      WebkitBackdropFilter: "blur(14px) saturate(1.4)",
      opacity: loading ? 0.7 : 1,
      transition: "opacity 200ms ease",
    }}
  >
    {OPTIONS.map((option) => {
      const active = value === option.id;
      return (
        <button
          key={option.id}
          type="button"
          aria-pressed={active}
          onClick={() => {
            triggerHaptic("light");
            onChange(option.id);
          }}
          className={`text-[11px] font-semibold rounded-full transition-colors ${
            active
              ? "bg-primary/20 text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
          style={{ padding: "6px 12px", minHeight: "32px" }}
        >
          {option.label}
        </button>
      );
    })}
  </div>
);
