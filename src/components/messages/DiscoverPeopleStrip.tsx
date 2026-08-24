import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PresenceDot } from "@/components/ui/presence-dot";
import { usePresence } from "@/hooks/usePresence";
import { useProfilePulse } from "@/hooks/useProfilePulse";
import { JET_MARK_SRC } from "@/lib/jet-mark";
import {
  ChevronLeft,
  ChevronRight,
  Utensils,
  Martini,
  Music,
  CalendarDays,
  type LucideIcon,
} from "lucide-react";

export interface DiscoverablePerson {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  preference_tags: string[] | null;
}

/** Preference markers mirror the onboarding deal-type buckets. */
const PREFERENCE_MARKERS: Record<
  string,
  { Icon: LucideIcon; label: string; hsl: string }
> = {
  food: { Icon: Utensils, label: "Food", hsl: "22 90% 62%" },
  drinks: { Icon: Martini, label: "Drinks", hsl: "268 78% 74%" },
  nightlife: { Icon: Music, label: "Nightlife", hsl: "330 82% 68%" },
  events: { Icon: CalendarDays, label: "Events", hsl: "190 84% 60%" },
};

const markerFor = (tag: string) => PREFERENCE_MARKERS[tag.trim().toLowerCase()];

/**
 * Swipeable strip of discoverable JET users. Horizontal touch swipe (native
 * momentum + snap), pointer drag on desktop, and arrow affordances when the
 * rail overflows. Each tile shows the avatar with a live presence dot, the
 * username, and that person's preference markers — all fluid-sized.
 */
export function DiscoverPeopleStrip({
  userId,
  onSelect,
}: {
  userId: string;
  onSelect: (id: string) => void;
}) {
  const [people, setPeople] = useState<DiscoverablePerson[]>([]);
  const [loading, setLoading] = useState(true);
  const { getStatus } = usePresence(userId);

  const railRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const reloadRef = useRef<() => void>(() => {});
  useProfilePulse(() => reloadRef.current?.(), !!userId);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { data, error } = await supabase.rpc("discoverable_people", {
          _limit: 30,
        });
        if (cancelled) return;
        if (error) throw error;
        setPeople((data || []) as DiscoverablePerson[]);
      } catch (err) {
        console.error("Error loading discoverable people:", err);
        if (!cancelled) setPeople([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    reloadRef.current = () => {
      void load();
    };
    void load();

    const run = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      void load();
    };
    const poll = setInterval(run, 30000);
    window.addEventListener("focus", run);
    document.addEventListener("visibilitychange", run);
    return () => {
      cancelled = true;
      clearInterval(poll);
      window.removeEventListener("focus", run);
      document.removeEventListener("visibilitychange", run);
    };
  }, [userId]);

  /* ── Overflow affordances ── */
  const syncArrows = useCallback(() => {
    const el = railRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    syncArrows();
    const el = railRef.current;
    if (!el) return;
    const ro = new ResizeObserver(syncArrows);
    ro.observe(el);
    return () => ro.disconnect();
  }, [syncArrows, people.length, loading]);

  const nudge = (dir: 1 | -1) => {
    const el = railRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(160, el.clientWidth * 0.8), behavior: "smooth" });
  };

  /* ── Pointer drag (desktop swipe) ── */
  const drag = useRef<{ x: number; left: number; active: boolean }>({
    x: 0,
    left: 0,
    active: false,
  });

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "touch") return; // native touch scrolling handles this
    const el = railRef.current;
    if (!el) return;
    drag.current = { x: e.clientX, left: el.scrollLeft, active: true };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const el = railRef.current;
    if (!el || !drag.current.active) return;
    const dx = e.clientX - drag.current.x;
    if (Math.abs(dx) > 3) el.scrollLeft = drag.current.left - dx;
  };

  const endDrag = () => {
    drag.current.active = false;
  };

  if (!loading && people.length === 0) return null;

  return (
    <section
      aria-label="Discover people on JET"
      className="relative border-b border-border/60"
      style={{ padding: "clamp(10px, 2.8vw, 14px) 0" }}
    >
      <h2
        className="heading-luxe-eyebrow"
        style={{ padding: "0 clamp(12px, 3.2vw, 16px) 8px" }}
      >
        Discover People
      </h2>

      {canScrollLeft && (
        <button
          type="button"
          aria-label="Scroll people left"
          onClick={() => nudge(-1)}
          className="hidden sm:flex absolute left-1 top-1/2 z-10 h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-background/80 backdrop-blur-md text-foreground/80 hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      )}
      {canScrollRight && (
        <button
          type="button"
          aria-label="Scroll people right"
          onClick={() => nudge(1)}
          className="hidden sm:flex absolute right-1 top-1/2 z-10 h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-background/80 backdrop-blur-md text-foreground/80 hover:text-foreground"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      )}

      <div
        ref={railRef}
        role="list"
        onScroll={syncArrows}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        className="flex overflow-x-auto overscroll-x-contain no-scrollbar snap-x snap-mandatory"
        style={{
          gap: "clamp(8px, 2.6vw, 14px)",
          padding: "0 clamp(12px, 3.2vw, 16px) 4px",
          scrollbarWidth: "none",
          WebkitOverflowScrolling: "touch",
          touchAction: "pan-x",
        }}
      >
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div
                key={`sk-${i}`}
                className="flex flex-col items-center gap-1 shrink-0 p-1"
                style={{ width: "clamp(68px, 19vw, 88px)" }}
              >
                <div
                  className="rounded-full bg-muted animate-pulse"
                  style={{
                    width: "clamp(48px, 13vw, 60px)",
                    height: "clamp(48px, 13vw, 60px)",
                  }}
                />
                <div className="h-[14px] w-12 rounded bg-muted animate-pulse" />
                <div className="h-[12px] w-10 rounded bg-muted animate-pulse" />
              </div>
            ))
          : people.map((p) => {
              const name = p.display_name || "User";
              const tags = (p.preference_tags || [])
                .map((t) => ({ tag: t, marker: markerFor(t) }))
                .filter((t) => t.marker)
                .slice(0, 4);
              return (
                <button
                  key={p.id}
                  role="listitem"
                  type="button"
                  data-testid="discover-person"
                  onClick={() => onSelect(p.id)}
                  className="snap-start flex flex-col items-center gap-1 shrink-0 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/60 rounded-lg p-1"
                  style={{ width: "clamp(68px, 19vw, 88px)", minHeight: 44 }}
                  aria-label={`View ${name}'s profile${
                    tags.length ? `. Interests: ${tags.map((t) => t.marker!.label).join(", ")}` : ""
                  }`}
                >
                  <span className="relative inline-flex">
                    <Avatar
                      className="ring-1 ring-border/60"
                      style={{
                        width: "clamp(48px, 13vw, 60px)",
                        height: "clamp(48px, 13vw, 60px)",
                      }}
                    >
                      <AvatarImage
                        src={p.avatar_url || JET_MARK_SRC}
                        alt={name}
                        className="object-cover"
                      />
                      <AvatarFallback
                        className="bg-gradient-to-br from-primary/20 to-accent/20 text-primary font-medium"
                        delayMs={400}
                      >
                        {name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <PresenceDot status={getStatus(p.id)} size={11} userId={p.id} />
                  </span>

                  <span
                    className="leading-tight text-foreground/85 text-center w-full"
                    style={{
                      fontSize: "clamp(10px, 2.8vw, 12px)",
                      display: "-webkit-box",
                      WebkitLineClamp: 1,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                    title={name}
                  >
                    {name}
                  </span>

                  {tags.length > 0 && (
                    <span className="flex items-center justify-center gap-[3px] flex-wrap">
                      {tags.map(({ tag, marker }) => {
                        const { Icon, label, hsl } = marker!;
                        return (
                          <span
                            key={tag}
                            title={label}
                            aria-hidden="true"
                            className="inline-flex items-center justify-center rounded-full"
                            style={{
                              width: "clamp(14px, 4vw, 17px)",
                              height: "clamp(14px, 4vw, 17px)",
                              background: `hsl(${hsl} / 0.16)`,
                              boxShadow: `0 0 6px hsl(${hsl} / 0.28)`,
                              color: `hsl(${hsl})`,
                            }}
                          >
                            <Icon style={{ width: "62%", height: "62%" }} />
                          </span>
                        );
                      })}
                    </span>
                  )}
                </button>
              );
            })}
      </div>
    </section>
  );
}
