import { useEffect, useRef } from "react";
import { CATEGORY_FILTER_IDS, getCategoryById } from "@/lib/venue-categories";
import { triggerHaptic } from "@/lib/haptics";
import { analytics } from "@/lib/analytics";

interface CategoryFilterBarProps {
  /** Active category ids; an empty array shows every venue. */
  value: string[];
  onChange: (next: string[]) => void;
  /** Venue counts per category id, used to hide empty chips and show totals. */
  counts: Record<string, number>;
}

/**
 * Horizontally scrollable category chips over the map.
 *
 * Selecting a chip filters the markers themselves — it never opens a JetCard.
 * A card only appears once the user taps a marker that survived the filter.
 * Glyphs and accents come from the shared taxonomy so a chip, its markers and
 * the JetCard badge all wear the same icon.
 */
export function CategoryFilterBar({
  value,
  onChange,
  counts,
}: CategoryFilterBarProps) {
  const available = CATEGORY_FILTER_IDS.filter(
    (id) => (counts[id] ?? 0) > 0 || value.includes(id),
  );
  const allActive = value.length === 0;
  const total = CATEGORY_FILTER_IDS.reduce(
    (sum, id) => sum + (counts[id] ?? 0),
    0,
  );
  // Impression: fire once per session + route once the row has real chips, so
  // the number means "users who saw the filter", not "map re-rendered".
  const impressionSent = useRef(false);
  const availableKey = available.join(",");
  useEffect(() => {
    if (impressionSent.current || available.length === 0) return;
    const key = `cat_filter_impression:${window.location.pathname}`;
    try {
      if (sessionStorage.getItem(key)) {
        impressionSent.current = true;
        return;
      }
      sessionStorage.setItem(key, "1");
    } catch {
      /* private mode — still record the impression once per mount */
    }
    impressionSent.current = true;
    analytics.categoryFilterImpression(available, total);
    // availableKey/total are snapshot inputs for the single impression.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableKey]);

  if (available.length === 0) return null;

  /** Toggle one bucket in/out of the multi-select; null clears everything. */
  const select = (id: string | null) => {
    triggerHaptic("light");
    if (id === null) {
      if (value.length > 0) analytics.categoryFilterCleared(value);
      onChange([]);
      return;
    }
    const wasActive = value.includes(id);
    const next = wasActive ? value.filter((v) => v !== id) : [...value, id];
    analytics.categoryFilterSelected(id, !wasActive, next, counts[id] ?? 0);
    onChange(next);
  };

  return (
    <div
      role="group"
      aria-label="Filter map by category"
      className="pointer-events-auto flex items-center gap-1.5 overflow-x-auto scrollbar-hide pr-3"
      style={{
        position: "absolute",
        top: "calc(var(--map-ui-inset-top, 0.75rem) + 52px)",
        left: "var(--map-ui-inset-left, 0.75rem)",
        right: "var(--map-ui-inset-right, 0.75rem)",
        zIndex: 29,
        maxWidth: "100%",
      }}
    >
      <button
        type="button"
        onClick={() => select(null)}
        aria-pressed={allActive}
        aria-label={`All categories — ${total} ${total === 1 ? "match" : "matches"}`}
        className="shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors active:scale-95 backdrop-blur-xl"
        style={{
          minHeight: "34px",
          borderColor:
            allActive ? "hsl(var(--primary))" : "hsl(var(--border) / 0.6)",
          background:
            allActive
              ? "hsl(var(--primary) / 0.18)"
              : "hsl(var(--card) / 0.7)",
          color:
            allActive ? "hsl(var(--primary))" : "hsl(var(--foreground))",
        }}
      >
        <span>All</span>
        <span
          className="text-[10px] tabular-nums rounded-full px-1.5 py-0.5"
          style={{
            background:
              allActive
                ? "hsl(var(--primary) / 0.18)"
                : "hsl(var(--muted) / 0.6)",
            color:
              allActive
                ? "hsl(var(--primary))"
                : "hsl(var(--muted-foreground))",
          }}
        >
          {total}
        </span>
      </button>


      {available.map((id) => {
        const def = getCategoryById(id);
        if (!def) return null;
        const Icon = def.Icon;
        const active = value.includes(id);
        return (
          <button
            key={id}
            type="button"
            onClick={() => select(id)}
            aria-pressed={active}
            aria-label={`${def.label} — ${counts[id] ?? 0} ${(counts[id] ?? 0) === 1 ? "match" : "matches"}`}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors active:scale-95 backdrop-blur-xl"
            style={{
              minHeight: "34px",
              borderColor: active ? def.dark : "hsl(var(--border) / 0.6)",
              background: active
                ? `linear-gradient(150deg, ${def.dark}33, ${def.dark}14)`
                : "hsl(var(--card) / 0.7)",
              color: active ? def.dark : "hsl(var(--foreground))",
              boxShadow: active ? `0 0 14px ${def.dark}33` : "none",
            }}
          >
            <Icon
              className="w-3.5 h-3.5 shrink-0"
              style={{ color: def.dark }}
              aria-hidden="true"
            />
            <span className="whitespace-nowrap">{def.label}</span>
            <span
              className="text-[10px] tabular-nums rounded-full px-1.5 py-0.5"
              style={{
                background: active
                  ? `${def.dark}26`
                  : "hsl(var(--muted) / 0.6)",
                color: active ? def.dark : "hsl(var(--muted-foreground))",
              }}
            >
              {counts[id] ?? 0}
            </span>

          </button>
        );
      })}
    </div>
  );
}
