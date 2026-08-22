import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Gauge,
  RefreshCw,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import {
  getMapSyncLatency,
  runMapSyncLatencyCheck,
  type MapSyncLatencyAlert,
  type MapSyncLatencyMetric,
  type MapSyncLatencyThreshold,
} from "@/lib/map-sync-latency.functions";

const STAGE_LABEL: Record<string, string> = {
  write: "Location write",
  fetch: "Data fetch",
  render: "Map paint",
  end_to_end: "End-to-end freshness",
};

const STAGE_HINT: Record<string, string> = {
  write: "App → Cloud acknowledgement of a new location point",
  fetch: "Heatmap request round trip",
  render: "New data → layer fully painted",
  end_to_end: "Newest stored point → visible on the heatmap",
};

const STAGE_ORDER = ["write", "fetch", "render", "end_to_end"];

const formatMs = (value: number | null | undefined) => {
  if (value == null || !Number.isFinite(value)) return "—";
  return value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${Math.round(value)}ms`;
};

export function MapSyncLatencyPanel() {
  const fetchLatency = useServerFn(getMapSyncLatency);
  const runCheck = useServerFn(runMapSyncLatencyCheck);
  const [metrics, setMetrics] = useState<MapSyncLatencyMetric[]>([]);
  const [thresholds, setThresholds] = useState<MapSyncLatencyThreshold[]>([]);
  const [alerts, setAlerts] = useState<MapSyncLatencyAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetchLatency({ data: { windowMinutes: 60 } });
      setMetrics(res.metrics ?? []);
      setThresholds(res.thresholds ?? []);
      setAlerts(res.alerts ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load map sync latency");
    }
    setLoading(false);
    setLastUpdated(new Date());
  }, [fetchLatency]);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 120_000);
    return () => clearInterval(id);
  }, [load]);

  const checkNow = async () => {
    setBusy(true);
    try {
      const res = await runCheck();
      toast.success(
        `Latency check run — ${res.opened} degraded, ${res.resolved} recovered`,
      );
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Latency check failed");
    }
    setBusy(false);
  };

  const openAlerts = alerts.filter((a) => a.status === "open");
  const thresholdFor = (stage: string) =>
    thresholds.find((t) => t.stage === stage);

  const severityFor = (stage: string, p95: number) => {
    const t = thresholdFor(stage);
    if (!t || !t.enabled) return "ok" as const;
    if (p95 >= t.crit_ms) return "critical" as const;
    if (p95 >= t.warn_ms) return "warning" as const;
    return "ok" as const;
  };

  const ordered = [...metrics].sort(
    (a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage),
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Gauge className="h-4 w-4 text-primary" />
            Map sync latency
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Last 60 minutes, p95 per stage. Alerts email admins when a stage
            degrades past its threshold.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={checkNow}
          disabled={busy}
          className="shrink-0"
        >
          <RefreshCw className={`mr-2 h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
          Check now
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <>
            <div className="flex items-center gap-2 text-sm">
              {openAlerts.length === 0 ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span className="text-muted-foreground">
                    All stages within thresholds
                  </span>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  <span>
                    {openAlerts.length} stage
                    {openAlerts.length === 1 ? "" : "s"} degraded
                  </span>
                </>
              )}
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {STAGE_ORDER.map((stage) => {
                const m = ordered.find((x) => x.stage === stage);
                const sev = m ? severityFor(stage, m.p95_ms) : "ok";
                const t = thresholdFor(stage);
                return (
                  <div
                    key={stage}
                    className="rounded-lg border border-border/60 bg-card/40 p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">
                        {STAGE_LABEL[stage] ?? stage}
                      </span>
                      <Badge
                        variant={
                          sev === "critical"
                            ? "destructive"
                            : sev === "warning"
                              ? "secondary"
                              : "outline"
                        }
                      >
                        {sev === "ok" ? "healthy" : sev}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {STAGE_HINT[stage]}
                    </p>
                    <div className="mt-2 flex items-baseline gap-3">
                      <span className="text-xl font-semibold tabular-nums">
                        {formatMs(m?.p95_ms)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        p50 {formatMs(m?.p50_ms)} · max {formatMs(m?.max_ms)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <Activity className="h-3 w-3" />
                      {m?.samples ?? 0} samples · {m?.users ?? 0} users
                      {t ? ` · warn ${formatMs(t.warn_ms)}` : ""}
                    </div>
                  </div>
                );
              })}
            </div>

            {alerts.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">
                  Recent alerts
                </p>
                {alerts.slice(0, 8).map((a) => (
                  <div
                    key={a.id}
                    className="flex items-start justify-between gap-3 rounded-md border border-border/50 px-3 py-2 text-xs"
                  >
                    <div>
                      <span className="font-medium">
                        {STAGE_LABEL[a.stage] ?? a.stage}
                      </span>{" "}
                      <span className="text-muted-foreground">{a.message}</span>
                    </div>
                    <Badge
                      variant={a.status === "open" ? "destructive" : "outline"}
                      className="shrink-0"
                    >
                      {a.status === "open"
                        ? a.severity
                        : `resolved ${formatDistanceToNow(new Date(a.resolved_at ?? a.created_at), { addSuffix: true })}`}
                    </Badge>
                  </div>
                ))}
              </div>
            )}

            {lastUpdated && (
              <p className="text-[11px] text-muted-foreground">
                Updated {formatDistanceToNow(lastUpdated, { addSuffix: true })}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
