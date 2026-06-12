import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { AlertCircle, TrendingDown } from "lucide-react";

/**
 * GTM funnel dashboard — reads `analytics_events` directly (admins have
 * a SELECT-all RLS policy) and computes unique-session counts at each
 * step. Conversion percentages are step-over-step, with the first step
 * normalized to 100%.
 *
 * Funnel: Search Performed → Deal Viewed → Deal Clicked → Subscription Checkout Started
 */

type RangeKey = "24h" | "7d" | "30d";
const RANGE_OPTIONS: Array<{ key: RangeKey; label: string; hours: number }> = [
  { key: "24h", label: "Last 24h", hours: 24 },
  { key: "7d", label: "Last 7 days", hours: 24 * 7 },
  { key: "30d", label: "Last 30 days", hours: 24 * 30 },
];

interface FunnelStep {
  name: string;
  eventName: string;
  color: string;
}

const STEPS: FunnelStep[] = [
  { name: "Search Performed",   eventName: "Search Performed",              color: "hsl(var(--primary))" },
  { name: "Deal Viewed",        eventName: "Deal Viewed",                   color: "hsl(var(--accent))" },
  { name: "Deal Clicked",       eventName: "Deal Clicked",                  color: "hsl(var(--gold))" },
  { name: "Checkout Started",   eventName: "Subscription Checkout Started", color: "hsl(var(--destructive))" },
];

interface StepCounts {
  sessions: number;
  events: number;
}

export function ConversionFunnel() {
  const [range, setRange] = useState<RangeKey>("7d");
  const [counts, setCounts] = useState<Record<string, StepCounts> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const hours = RANGE_OPTIONS.find((r) => r.key === range)!.hours;
    const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();

    (async () => {
      try {
        const client = supabase as unknown as {
          from: (t: string) => {
            select: (cols: string) => {
              in: (col: string, vals: string[]) => {
                gte: (col: string, v: string) => Promise<{
                  data: Array<{ event_name: string; session_id: string | null }> | null;
                  error: { message: string } | null;
                }>;
              };
            };
          };
        };

        const { data, error: qErr } = await client
          .from("analytics_events")
          .select("event_name, session_id")
          .in("event_name", STEPS.map((s) => s.eventName))
          .gte("created_at", since);

        if (qErr) throw new Error(qErr.message);
        if (cancelled) return;

        // Tally unique sessions and total events per step.
        const acc: Record<string, { sessions: Set<string>; events: number }> = {};
        STEPS.forEach((s) => { acc[s.eventName] = { sessions: new Set(), events: 0 }; });

        for (const row of data ?? []) {
          const bucket = acc[row.event_name];
          if (!bucket) continue;
          bucket.events += 1;
          if (row.session_id) bucket.sessions.add(row.session_id);
        }

        const result: Record<string, StepCounts> = {};
        for (const s of STEPS) {
          result[s.eventName] = {
            sessions: acc[s.eventName].sessions.size,
            events: acc[s.eventName].events,
          };
        }
        setCounts(result);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load funnel data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [range]);

  const rows = useMemo(() => {
    if (!counts) return null;
    const topSessions = counts[STEPS[0].eventName].sessions || 0;
    return STEPS.map((s, i) => {
      const sessions = counts[s.eventName].sessions;
      const events = counts[s.eventName].events;
      const fromTop = topSessions > 0 ? (sessions / topSessions) * 100 : 0;
      const prevSessions = i === 0 ? sessions : counts[STEPS[i - 1].eventName].sessions;
      const stepConversion = i === 0
        ? 100
        : prevSessions > 0 ? (sessions / prevSessions) * 100 : 0;
      const dropoff = i === 0 ? 0 : Math.max(prevSessions - sessions, 0);
      return { ...s, sessions, events, fromTop, stepConversion, dropoff };
    });
  }, [counts]);

  const overallConversion = useMemo(() => {
    if (!counts) return 0;
    const top = counts[STEPS[0].eventName].sessions;
    const bottom = counts[STEPS[STEPS.length - 1].eventName].sessions;
    return top > 0 ? (bottom / top) * 100 : 0;
  }, [counts]);

  return (
    <div className="flex flex-col gap-4">
      {/* Range selector */}
      <div className="flex items-center gap-2 flex-wrap">
        {RANGE_OPTIONS.map((opt) => (
          <Button
            key={opt.key}
            size="sm"
            variant={range === opt.key ? "default" : "outline"}
            onClick={() => setRange(opt.key)}
            className="rounded-full"
          >
            {opt.label}
          </Button>
        ))}
        <div className="ml-auto text-xs text-muted-foreground">
          Unique sessions per step · step-over-step conversion
        </div>
      </div>

      {/* Overall conversion card */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            End-to-end conversion (Search → Checkout)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-9 w-32" />
          ) : (
            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-bold tracking-tight">
                {overallConversion.toFixed(2)}%
              </span>
              {counts && (
                <span className="text-sm text-muted-foreground">
                  {counts[STEPS[STEPS.length - 1].eventName].sessions} of {counts[STEPS[0].eventName].sessions} sessions
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Funnel bars */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Funnel breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
              <AlertCircle className="h-4 w-4 mt-0.5 text-destructive shrink-0" />
              <div>
                <p className="font-medium text-destructive">Couldn't load funnel data</p>
                <p className="text-muted-foreground">{error}</p>
              </div>
            </div>
          )}

          {loading && !error && (
            <div className="flex flex-col gap-3">
              {STEPS.map((s) => <Skeleton key={s.eventName} className="h-16 w-full rounded-xl" />)}
            </div>
          )}

          {!loading && !error && rows && (
            <div className="flex flex-col gap-3">
              {rows.map((row, i) => (
                <div key={row.eventName} className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ background: row.color }}
                        aria-hidden="true"
                      />
                      <span className="font-medium truncate">{row.name}</span>
                    </div>
                    <div className="flex items-baseline gap-3 text-xs text-muted-foreground whitespace-nowrap">
                      <span className="font-mono tabular-nums text-foreground">
                        {row.sessions.toLocaleString()} <span className="text-muted-foreground">sessions</span>
                      </span>
                      <span className="hidden sm:inline">·</span>
                      <span className="hidden sm:inline font-mono tabular-nums">
                        {row.events.toLocaleString()} events
                      </span>
                    </div>
                  </div>
                  <div className="relative h-8 w-full rounded-lg bg-muted/40 overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 transition-[width] duration-500 ease-out"
                      style={{
                        width: `${Math.max(row.fromTop, 0.5)}%`,
                        background: `linear-gradient(90deg, ${row.color}, ${row.color}cc)`,
                      }}
                    />
                    <div className="relative z-10 h-full flex items-center justify-between px-3 text-xs">
                      <span className="font-semibold text-foreground/90">
                        {row.fromTop.toFixed(1)}% of top
                      </span>
                      {i > 0 && (
                        <span className="text-muted-foreground">
                          {row.stepConversion.toFixed(1)}% step CVR
                        </span>
                      )}
                    </div>
                  </div>
                  {i > 0 && row.dropoff > 0 && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground pl-4">
                      <TrendingDown className="h-3 w-3" aria-hidden="true" />
                      <span>
                        {row.dropoff.toLocaleString()} sessions dropped from previous step
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default ConversionFunnel;