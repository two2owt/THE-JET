import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, CheckCircle2, RefreshCw, Timer, Inbox, Ban } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import {
  getEmailQueueMetrics,
  runEmailQueueHealthCheck,
  type EmailQueueMetric,
} from "@/lib/email-queue-monitor.functions";

interface AlertRow {
  id: string;
  queue_name: string;
  metric: string;
  severity: "warning" | "critical";
  observed_value: number;
  threshold_value: number;
  message: string;
  status: "open" | "resolved";
  created_at: string;
  resolved_at: string | null;
}

const METRIC_LABEL: Record<string, string> = {
  queue_depth: "Queue depth",
  processing_lag_seconds: "Processing lag",
  dlq_depth: "Dead-letter depth",
};

function fmtLag(seconds: number) {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

export function EmailQueueMonitorPanel() {
  const fetchMetrics = useServerFn(getEmailQueueMetrics);
  const runCheck = useServerFn(runEmailQueueHealthCheck);
  const [metrics, setMetrics] = useState<EmailQueueMetric[]>([]);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [m, a] = await Promise.all([
        fetchMetrics(),
        supabase
          .from("email_queue_alerts" as never)
          .select(
            "id, queue_name, metric, severity, observed_value, threshold_value, message, status, created_at, resolved_at",
          )
          .order("created_at", { ascending: false })
          .limit(50)
          .returns<AlertRow[]>(),
      ]);
      setMetrics(m ?? []);
      if (a.error) setError(a.error.message);
      else setAlerts(a.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load queue metrics");
    }
    setLoading(false);
    setLastUpdated(new Date());
  }, [fetchMetrics]);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 60_000);
    return () => clearInterval(id);
  }, [load]);

  const checkNow = async () => {
    setBusy(true);
    try {
      const res = await runCheck();
      toast.success(
        `Health check complete — ${res.opened} alerting, ${res.resolved} resolved`,
      );
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Health check failed");
    }
    setBusy(false);
  };

  const resolveAlert = async (id: string) => {
    const { error: err } = await supabase
      .from("email_queue_alerts" as never)
      .update({
        status: "resolved",
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", id);
    if (err) toast.error(err.message);
    else {
      toast.success("Alert resolved");
      void load();
    }
  };

  const openAlerts = alerts.filter((a) => a.status === "open");

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Inbox className="h-4 w-4" />
          Email queue monitoring
          {openAlerts.length > 0 ? (
            <Badge variant="destructive">{openAlerts.length} open</Badge>
          ) : (
            <Badge variant="secondary">healthy</Badge>
          )}
        </CardTitle>
        <div className="flex items-center gap-2">
          {lastUpdated && (
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(lastUpdated, { addSuffix: true })}
            </span>
          )}
          <Button size="sm" variant="outline" onClick={checkNow} disabled={busy}>
            <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
            Check now
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        {loading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {metrics.map((m) => (
              <div
                key={m.queue_name}
                className="rounded-lg border border-border/60 bg-card/40 p-3"
              >
                <p className="font-display text-sm">{m.queue_name}</p>
                <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-lg font-semibold">{m.queue_depth}</p>
                    <p className="text-[11px] text-muted-foreground">depth</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold">
                      {fmtLag(Number(m.processing_lag_seconds ?? 0))}
                    </p>
                    <p className="text-[11px] text-muted-foreground">lag</p>
                  </div>
                  <div>
                    <p
                      className={`text-lg font-semibold ${m.dlq_depth > 0 ? "text-destructive" : ""}`}
                    >
                      {m.dlq_depth}
                    </p>
                    <p className="text-[11px] text-muted-foreground">DLQ</p>
                  </div>
                </div>
              </div>
            ))}
            {metrics.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No email queues found.
              </p>
            )}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Alerts
          </p>
          {alerts.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4" /> No alerts recorded.
            </p>
          ) : (
            alerts.slice(0, 15).map((a) => (
              <div
                key={a.id}
                className="flex items-start justify-between gap-3 rounded-md border border-border/50 p-2"
              >
                <div className="flex items-start gap-2">
                  {a.status === "open" ? (
                    <AlertTriangle
                      className={`mt-0.5 h-4 w-4 ${a.severity === "critical" ? "text-destructive" : "text-primary"}`}
                    />
                  ) : (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  )}
                  <div>
                    <p className="text-sm">
                      {METRIC_LABEL[a.metric] ?? a.metric} · {a.queue_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {a.metric === "processing_lag_seconds"
                        ? `${fmtLag(Number(a.observed_value))} (limit ${fmtLag(Number(a.threshold_value))})`
                        : `${a.observed_value} (limit ${a.threshold_value})`}{" "}
                      · {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge
                    variant={
                      a.status === "resolved"
                        ? "outline"
                        : a.severity === "critical"
                          ? "destructive"
                          : "secondary"
                    }
                  >
                    {a.status === "resolved" ? "resolved" : a.severity}
                  </Badge>
                  {a.status === "open" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => resolveAlert(a.id)}
                    >
                      <Ban className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Timer className="h-3 w-3" /> Automated check runs every 5 minutes
          (warn/critical: depth 50/250, lag 5m/15m, DLQ 1/10).
        </p>
      </CardContent>
    </Card>
  );
}
