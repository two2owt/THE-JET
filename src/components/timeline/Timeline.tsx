import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, CircleDot, LucideIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBreakpoint } from "@/hooks/useBreakpoint";

export type TimelineStatus = "completed" | "current" | "upcoming" | "error";

export interface TimelineItem {
  id: string;
  /** Event name shown as the card title. */
  title: string;
  /** Supporting detail, revealed when expanded (or always, if not expandable). */
  description?: string;
  /** Date/time label rendered opposite the node (vertical) or under it (horizontal). */
  timestamp?: string;
  status?: TimelineStatus;
  /** Event-type icon rendered inside the node circle. */
  icon?: LucideIcon;
  /** Free-form type key used by the filter chips. */
  type?: string;
  /** Optional media / chart slot rendered inside the card. */
  media?: React.ReactNode;
}

export interface TimelineProps {
  items: TimelineItem[];
  /** Vertical (default) for chronology, horizontal for process steps. */
  orientation?: "vertical" | "horizontal";
  /** Vertical only. `alternating` puts cards on both sides of a centered line. */
  layout?: "alternating" | "single";
  /** Currently selected node id (controlled). */
  activeId?: string;
  onSelect?: (id: string) => void;
  /** Cards collapse to title + timestamp until clicked. */
  expandable?: boolean;
  /** Render type filter chips above the timeline. */
  filterable?: boolean;
  /** Reveal nodes/cards as they scroll into view. Defaults to true. */
  animate?: boolean;
  /** Tighter paddings for use inside panels/sheets. */
  compact?: boolean;
  /** Accessible label for the list. */
  ariaLabel?: string;
  className?: string;
}

const STATUS_RING: Record<TimelineStatus, string> = {
  completed: "border-primary/60 bg-primary text-primary-foreground",
  current: "border-primary bg-gradient-to-br from-primary to-primary-glow text-primary-foreground",
  upcoming: "border-border bg-background/70 text-muted-foreground",
  error: "border-destructive bg-destructive text-destructive-foreground",
};

const STATUS_GLOW: Record<TimelineStatus, string> = {
  completed: "shadow-[0_0_0_3px_hsl(var(--primary)/0.12)]",
  current: "shadow-[0_0_0_5px_hsl(var(--primary)/0.18),0_6px_18px_-6px_hsl(var(--primary)/0.7)]",
  upcoming: "",
  error: "shadow-[0_0_0_3px_hsl(var(--destructive)/0.15)]",
};

function StatusIcon({ status, Icon }: { status: TimelineStatus; Icon?: LucideIcon }) {
  if (Icon) return <Icon className="h-2.5 w-2.5" strokeWidth={2.5} />;
  if (status === "completed") return <Check className="h-2.5 w-2.5" strokeWidth={3} />;
  if (status === "error") return <X className="h-2.5 w-2.5" strokeWidth={3} />;
  if (status === "current") return <CircleDot className="h-2.5 w-2.5" strokeWidth={2.5} />;
  return null;
}

/** Reveal-on-scroll wrapper. Only transform/opacity, so it stays composited. */
function Reveal({
  children,
  index,
  enabled,
  from = "up",
  className,
}: {
  children: React.ReactNode;
  index: number;
  enabled: boolean;
  from?: "up" | "left" | "right";
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(!enabled);

  useEffect(() => {
    if (!enabled || shown) return;
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [enabled, shown]);

  const hidden =
    from === "left" ? "opacity-0 -translate-x-3" : from === "right" ? "opacity-0 translate-x-3" : "opacity-0 translate-y-3";

  return (
    <div
      ref={ref}
      className={cn("transition-[opacity,transform] duration-500 ease-out will-change-transform", shown ? "opacity-100 translate-x-0 translate-y-0" : hidden, className)}
      style={{ transitionDelay: shown ? `${Math.min(index, 8) * 60}ms` : "0ms" }}
    >
      {children}
    </div>
  );
}

function TimelineCard({
  item,
  status,
  expanded,
  expandable,
  active,
  align,
  compact,
  onClick,
}: {
  item: TimelineItem;
  status: TimelineStatus;
  expanded: boolean;
  expandable: boolean;
  active: boolean;
  align: "left" | "right";
  compact?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expandable ? expanded : undefined}
      aria-current={active ? "step" : undefined}
      className={cn(
        "group w-full rounded-xl border text-left backdrop-blur-md transition-[background,border-color,box-shadow] duration-200",
        compact ? "px-2.5 py-2" : "px-3.5 py-3",
        align === "right" ? "text-right" : "text-left",
        active
          ? "border-primary/45 bg-primary/10 shadow-[0_10px_28px_-14px_hsl(var(--primary)/0.7)]"
          : "border-border/50 bg-card/50 hover:border-primary/30 hover:bg-card/70",
        status === "error" && "border-destructive/40 bg-destructive/10",
        status === "upcoming" && !active && "opacity-70",
      )}
    >
      <div className={cn("flex items-baseline gap-2", align === "right" && "flex-row-reverse")}>
        <span className={cn("font-display font-bold leading-tight text-foreground", compact ? "text-[11px]" : "text-xs")}>
          {item.title}
        </span>
        {item.timestamp && (
          <time className="ml-auto shrink-0 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
            {item.timestamp}
          </time>
        )}
      </div>
      {(!expandable || expanded) && item.description && (
        <p className={cn("mt-1 text-[10px] leading-relaxed text-muted-foreground", compact && "mt-0.5")}>{item.description}</p>
      )}
      {(!expandable || expanded) && item.media && <div className="mt-2">{item.media}</div>}
    </button>
  );
}

const TimelineImpl = ({
  items,
  orientation = "vertical",
  layout = "single",
  activeId,
  onSelect,
  expandable = false,
  filterable = false,
  animate = true,
  compact = false,
  ariaLabel = "Timeline",
  className,
}: TimelineProps) => {
  const bp = useBreakpoint();
  const isNarrow = bp === "xs" || bp === "sm";
  // Alternating layout collapses to single-side on narrow viewports so cards
  // stay readable instead of squeezing into two columns.
  const effectiveLayout = orientation === "vertical" && layout === "alternating" && !isNarrow ? "alternating" : "single";

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);

  const types = useMemo(
    () => Array.from(new Set(items.map((i) => i.type).filter(Boolean))) as string[],
    [items],
  );
  const visible = useMemo(
    () => (typeFilter ? items.filter((i) => i.type === typeFilter) : items),
    [items, typeFilter],
  );

  const handleSelect = useCallback(
    (id: string) => {
      if (expandable) setExpandedId((prev) => (prev === id ? null : id));
      onSelect?.(id);
    },
    [expandable, onSelect],
  );

  const filters = filterable && types.length > 1 && (
    <div className="mb-2 flex flex-wrap gap-1.5">
      {[null, ...types].map((t) => (
        <button
          key={t ?? "all"}
          type="button"
          onClick={() => setTypeFilter(t)}
          aria-pressed={typeFilter === t}
          className={cn(
            "rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide transition",
            typeFilter === t
              ? "border-primary/50 bg-primary/15 text-foreground"
              : "border-border/50 bg-card/40 text-muted-foreground hover:text-foreground",
          )}
        >
          {t ?? "All"}
        </button>
      ))}
    </div>
  );

  if (orientation === "horizontal") {
    return (
      <div className={cn("w-full min-w-0", className)}>
        {filters}
        <ol
          aria-label={ariaLabel}
          className="flex snap-x snap-mandatory items-start gap-0 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {visible.map((item, i) => {
            const status = item.status ?? "upcoming";
            const active = activeId === item.id;
            return (
              <li key={item.id} className="relative flex min-w-[52px] flex-1 shrink-0 snap-start flex-col items-center">
                {/* Connecting line segment */}
                {i > 0 && (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute left-0 top-[9px] h-[2px] w-1/2 -translate-x-1/2",
                      status === "upcoming" ? "bg-border/60" : "bg-primary/50",
                    )}
                  />
                )}
                {i < visible.length - 1 && (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute right-0 top-[9px] h-[2px] w-1/2 translate-x-1/2",
                      (visible[i + 1].status ?? "upcoming") === "upcoming" ? "bg-border/60" : "bg-primary/50",
                    )}
                  />
                )}
                <Reveal index={i} enabled={animate}>
                  <button
                    type="button"
                    onClick={() => handleSelect(item.id)}
                    aria-label={`${item.title}${item.timestamp ? ` — ${item.timestamp}` : ""}`}
                    aria-current={active ? "step" : undefined}
                    className={cn(
                      "relative z-[1] flex items-center justify-center rounded-full border-2 transition-transform duration-200",
                      active || status === "current" ? "h-4 w-4 scale-110" : "h-3 w-3",
                      STATUS_RING[status],
                      STATUS_GLOW[status],
                    )}
                  >
                    <StatusIcon status={status} Icon={item.icon} />
                  </button>
                </Reveal>
                <span
                  className={cn(
                    "mt-1.5 max-w-full truncate px-0.5 text-center text-[9px] font-semibold",
                    active || status === "current" ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {item.title}
                </span>
                {item.timestamp && (
                  <span className="max-w-full truncate text-[8px] text-muted-foreground/70">{item.timestamp}</span>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    );
  }

  // Vertical
  const alternating = effectiveLayout === "alternating";
  return (
    <div className={cn("w-full min-w-0", className)}>
      {filters}
      <ol aria-label={ariaLabel} className={cn("relative", alternating ? "px-0" : "pl-6")}>
        {/* Track: 2px line, centered when alternating, left edge otherwise. */}
        <span
          aria-hidden="true"
          className={cn(
            "absolute top-1 bottom-1 w-[2px] rounded-full bg-gradient-to-b from-primary/60 via-border/70 to-border/30",
            alternating ? "left-1/2 -translate-x-1/2" : "left-[7px]",
          )}
        />
        {visible.map((item, i) => {
          const status = item.status ?? "upcoming";
          const active = activeId === item.id;
          const side: "left" | "right" = alternating && i % 2 === 1 ? "right" : "left";
          const node = (
            <button
              type="button"
              onClick={() => handleSelect(item.id)}
              aria-label={`${item.title}${item.timestamp ? ` — ${item.timestamp}` : ""}`}
              className={cn(
                "flex items-center justify-center rounded-full border-2 transition-transform duration-200",
                active || status === "current" ? "h-4 w-4 scale-110" : "h-3 w-3",
                STATUS_RING[status],
                STATUS_GLOW[status],
              )}
            >
              <StatusIcon status={status} Icon={item.icon} />
            </button>
          );

          if (alternating) {
            return (
              <li key={item.id} className="relative grid grid-cols-[1fr_auto_1fr] items-start gap-3 pb-3">
                <div className={cn(side === "left" ? "" : "opacity-0 pointer-events-none")}>
                  {side === "left" && (
                    <Reveal index={i} enabled={animate} from="left">
                      <TimelineCard
                        item={item}
                        status={status}
                        expanded={expandedId === item.id}
                        expandable={expandable}
                        active={active}
                        align="right"
                        compact={compact}
                        onClick={() => handleSelect(item.id)}
                      />
                    </Reveal>
                  )}
                </div>
                <div className="relative z-[1] pt-2">{node}</div>
                <div className={cn(side === "right" ? "" : "opacity-0 pointer-events-none")}>
                  {side === "right" && (
                    <Reveal index={i} enabled={animate} from="right">
                      <TimelineCard
                        item={item}
                        status={status}
                        expanded={expandedId === item.id}
                        expandable={expandable}
                        active={active}
                        align="left"
                        compact={compact}
                        onClick={() => handleSelect(item.id)}
                      />
                    </Reveal>
                  )}
                </div>
              </li>
            );
          }

          return (
            <li key={item.id} className="relative pb-3">
              <span className="absolute -left-6 top-2 z-[1] flex">{node}</span>
              <Reveal index={i} enabled={animate} from="left">
                <TimelineCard
                  item={item}
                  status={status}
                  expanded={expandedId === item.id}
                  expandable={expandable}
                  active={active}
                  align="left"
                  compact={compact}
                  onClick={() => handleSelect(item.id)}
                />
              </Reveal>
            </li>
          );
        })}
      </ol>
    </div>
  );
};

export const Timeline = memo(TimelineImpl);
Timeline.displayName = "Timeline";