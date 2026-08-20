import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, CheckCircle2, RefreshCw, Radio, ShieldCheck } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import {
  getRealtimePublicationAudit,
  runRealtimeGuardCheck,
  type RealtimeAuditRow,
} from "@/lib/realtime-guard.functions";

interface GuardAlert {
  id: string;
  check_name: string;
  target: string;
  severity: "critical" | "warning";
  status: "open" | "resolved";
  message: string;
  created_at: string;
  resolved_at: string | null;
}

const CHECK_LABEL: Record<string, string> = {
  unapproved_publication_member: "Unapproved broadcast",
  published_table_rls_disabled: "Access rules disabled",
  unscoped_select_policy: "Unscoped read policy",
  replica_identity_full: "Full old-row payloads",
};

export function RealtimeGuardPanel() {
  const fetchAudit = useServerFn(getRealtimePublicationAudit);
  const runCheck = useServerFn(runRealtimeGuardCheck);
  const [audit, setAudit] = useState<RealtimeAuditRow[]>([]);
  const [alerts, setAlerts] = useState<GuardAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [rows, a] = await Promise.all([
        fetchAudit(),
        supabase
          .from("realtime_guard_alerts" as never)
          .select("id, check_name, target, severity, status, message, created_at, resolved_at")
          .order("created_at", { ascending: false })
          .limit(50)
          .returns<GuardAlert[]>(),
      ]);
      setAudit(rows ?? []);
      if (a.error) setError(a.error.message);
      else setAlerts(a.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load realtime guard status");
    }
    setLoading(false);
    setLastUpdated(new Date());
  }, [fetchAudit]);

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
        `Realtime guard run — ${res.opened} alerting, ${res.resolved} resolved`,
      );
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Realtime guard check failed");
    }
    setBusy(false);
  };

  const openAlerts = alerts.filter((a) => a.status === "open");

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Radio className="h-4 w-4" />
          Realtime broadcast guard
          {openAlerts.length > 0 ? (
            <Badge variant="destructive">{openAlerts.length} open</Badge>
          ) : (
            <Badge variant="secondary">locked down</Badge>
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
          <div className="flex flex-col gap-2">
            {audit.map((row) => {
              const healthy =
                row.approved &&
                row.rls_enabled &&
                row.unscoped_select_policies.length === 0;
              return (
                <div
                  key={row.table_name}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-card/40 p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-display text-sm">{row.table_name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {row.sensitivity} · old rows: {row.replica_identity}
                      {row.unscoped_select_policies.length > 0 &&
                        ` · unscoped: ${row.unscoped_select_policies.join(", ")}`}
                    </p>
                  </div>
                  {healthy ? (
                    <Badge variant="secondary" className="shrink-0 gap-1">
                      <ShieldCheck className="h-3 w-3" />
                      scoped
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="shrink-0 gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      review
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Recent alerts
          </p>
          {alerts.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4" />
              No realtime leakage detected. Checks run every 15 minutes.
            </p>
          ) : (
            alerts.slice(0, 10).map((a) => (
              <div
                key={a.id}
                className="rounded-lg border border-border/60 bg-card/40 p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">
                    {CHECK_LABEL[a.check_name] ?? a.check_name} · {a.target}
                  </span>
                  <Badge
                    variant={
                      a.status === "resolved"
                        ? "secondary"
                        : a.severity === "critical"
                          ? "destructive"
                          : "outline"
                    }
                  >
                    {a.status === "resolved" ? "resolved" : a.severity}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{a.message}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                </p>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
