import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, RefreshCw, Radio } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { toast } from "sonner";

interface LogRow {
  id: string;
  message_id: string | null;
  template_name: string;
  recipient_email: string;
  status: string;
  error_message: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

type RangeKey = "24h" | "7d" | "30d";
type StatusFilter =
  | "all"
  | "problems"
  | "sent"
  | "failed"
  | "dlq"
  | "suppressed"
  | "bounced"
  | "pending";

const RANGE_HOURS: Record<RangeKey, number> = {
  "24h": 24,
  "7d": 24 * 7,
  "30d": 24 * 30,
};
const PROBLEM_STATUSES = [
  "failed",
  "dlq",
  "bounced",
  "complained",
  "suppressed",
];

function statusVariant(
  status: string,
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "sent") return "default";
  if (status === "pending") return "secondary";
  if (
    status === "failed" ||
    status === "dlq" ||
    status === "bounced" ||
    status === "complained"
  )
    return "destructive";
  return "outline";
}

/** One email = many rows sharing message_id. Keep only the latest row per email. */
function dedupe(rows: LogRow[]): LogRow[] {
  const latest = new Map<string, LogRow>();
  const attempts = new Map<string, number>();
  for (const r of rows) {
    const key = r.message_id ?? r.id;
    attempts.set(key, (attempts.get(key) ?? 0) + 1);
    const prev = latest.get(key);
    if (!prev || new Date(r.created_at) > new Date(prev.created_at))
      latest.set(key, r);
  }
  return Array.from(latest.entries())
    .map(
      ([key, row]) =>
        ({ ...row, __attempts: attempts.get(key) ?? 1 }) as LogRow & {
          __attempts: number;
        },
    )
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
}

export function EmailHealthPanel() {
  const [range, setRange] = useState<RangeKey>("24h");
  const [status, setStatus] = useState<StatusFilter>("problems");
  const [template, setTemplate] = useState<string>("all");
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const alerted = useRef<Set<string>>(new Set());

  const sinceIso = useMemo(
    () => new Date(Date.now() - RANGE_HOURS[range] * 3_600_000).toISOString(),
    [range],
  );

  const load = useCallback(async () => {
    setError(null);
    const { data, error: err } = await supabase
      .from("email_send_log" as never)
      .select(
        "id, message_id, template_name, recipient_email, status, error_message, metadata, created_at",
      )
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(1000)
      .returns<LogRow[]>();
    if (err) setError(err.message);
    else setRows(data ?? []);
    setLoading(false);
    setLastUpdated(new Date());
  }, [sinceIso]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  // email_send_log holds recipient PII and is deliberately NOT published to
  // Realtime, so this panel polls instead of streaming row changes.
  useEffect(() => {
    setLive(false);
    const poll = window.setInterval(load, 15_000);
    return () => {
      window.clearInterval(poll);
    };
  }, [load]);

  // Surface newly observed problem rows from the polled snapshot.
  useEffect(() => {
    for (const row of rows) {
      if (PROBLEM_STATUSES.includes(row.status) && !alerted.current.has(row.id)) {
        alerted.current.add(row.id);
        toast.error(`Email ${row.status}: ${row.template_name}`, {
          description: row.error_message?.slice(0, 120) ?? row.recipient_email,
        });
      }
    }
  }, [rows]);

  const deduped = useMemo(() => dedupe(rows), [rows]);

  const templates = useMemo(
    () => Array.from(new Set(deduped.map((r) => r.template_name))).sort(),
    [deduped],
  );

  const stats = useMemo(() => {
    const s = {
      total: 0,
      sent: 0,
      pending: 0,
      failed: 0,
      suppressed: 0,
      retried: 0,
    };
    for (const r of deduped as (LogRow & { __attempts?: number })[]) {
      s.total += 1;
      if (r.status === "sent") s.sent += 1;
      else if (r.status === "pending") s.pending += 1;
      else if (r.status === "suppressed") s.suppressed += 1;
      else if (PROBLEM_STATUSES.includes(r.status)) s.failed += 1;
      if ((r.__attempts ?? 1) > 2) s.retried += 1;
    }
    return s;
  }, [deduped]);

  const filtered = useMemo(() => {
    return deduped.filter((r) => {
      if (template !== "all" && r.template_name !== template) return false;
      if (status === "all") return true;
      if (status === "problems") return PROBLEM_STATUSES.includes(r.status);
      if (status === "failed")
        return r.status === "failed" || r.status === "dlq";
      return r.status === status;
    });
  }, [deduped, status, template]);

  const failureRate = stats.total
    ? Math.round((stats.failed / stats.total) * 100)
    : 0;

  return (
    <div className="flex flex-col" style={{ gap: "var(--space-md)" }}>
      {stats.failed > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="flex items-start gap-3 p-4">
            <AlertTriangle
              className="h-5 w-5 shrink-0 text-destructive"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-destructive">
                {stats.failed} failed {stats.failed === 1 ? "send" : "sends"} in
                the last {range}
                {failureRate > 0 ? ` (${failureRate}% of all sends)` : ""}
              </p>
              <p className="text-xs text-muted-foreground">
                Failed and dead-lettered emails never reached the recipient.
                Check the error column below.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            Email delivery health
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                live
                  ? "bg-primary/15 text-primary"
                  : "bg-muted text-muted-foreground"
              }`}
              title={
                live
                  ? "Streaming new sends live"
                  : "Reconnecting — polling every 30s"
              }
            >
              <Radio className="h-3 w-3" aria-hidden="true" />
              {live ? "Live" : "Polling"}
            </span>
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={range}
              onValueChange={(v) => setRange(v as RangeKey)}
            >
              <SelectTrigger className="h-9 w-[110px]" aria-label="Time range">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24h">Last 24h</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as StatusFilter)}
            >
              <SelectTrigger
                className="h-9 w-[140px]"
                aria-label="Status filter"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="problems">Problems only</SelectItem>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="failed">Failed / DLQ</SelectItem>
                <SelectItem value="suppressed">Suppressed</SelectItem>
                <SelectItem value="bounced">Bounced</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>
            <Select value={template} onValueChange={setTemplate}>
              <SelectTrigger
                className="h-9 w-[150px]"
                aria-label="Template filter"
              >
                <SelectValue placeholder="All templates" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All templates</SelectItem>
                {templates.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              onClick={() => load()}
              aria-label="Refresh email log"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-xl" />
              ))}
            </div>
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {[
                  { label: "Emails", value: stats.total, tone: "" },
                  {
                    label: "Sent",
                    value: stats.sent,
                    tone: "text-emerald-400",
                  },
                  {
                    label: "Failed / DLQ",
                    value: stats.failed,
                    tone: "text-destructive",
                  },
                  {
                    label: "Retried",
                    value: stats.retried,
                    tone: "text-amber-400",
                  },
                  {
                    label: "Suppressed",
                    value: stats.suppressed,
                    tone: "text-muted-foreground",
                  },
                ].map((s) => (
                  <div
                    key={s.label}
                    className="rounded-xl border border-border/60 bg-card/50 p-3"
                  >
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                    <p className={`font-display text-2xl font-bold ${s.tone}`}>
                      {s.value}
                    </p>
                  </div>
                ))}
              </div>
              {lastUpdated && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Updated{" "}
                  {formatDistanceToNow(lastUpdated, { addSuffix: true })}
                  {stats.pending > 0 ? ` · ${stats.pending} still queued` : ""}
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {status === "problems" ? "Problem sends" : "Recent sends"} (
            {filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No{" "}
              {status === "problems"
                ? "failed, retried, or suppressed"
                : "matching"}{" "}
              sends in this window.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="pb-2 pr-3 font-medium">Status</th>
                    <th className="pb-2 pr-3 font-medium">Template</th>
                    <th className="pb-2 pr-3 font-medium">Recipient</th>
                    <th className="pb-2 pr-3 font-medium">When</th>
                    <th className="pb-2 font-medium">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 100).map((r) => {
                    const attempts =
                      (r as LogRow & { __attempts?: number }).__attempts ?? 1;
                    return (
                      <tr
                        key={r.id}
                        className="border-t border-border/50 align-top"
                      >
                        <td className="py-2 pr-3">
                          <Badge variant={statusVariant(r.status)}>
                            {r.status}
                          </Badge>
                          {attempts > 2 && (
                            <Badge
                              variant="outline"
                              className="ml-1 text-amber-400"
                            >
                              {attempts - 1} retries
                            </Badge>
                          )}
                        </td>
                        <td className="py-2 pr-3 font-medium">
                          {r.template_name}
                        </td>
                        <td className="py-2 pr-3 text-muted-foreground break-all">
                          {r.recipient_email}
                        </td>
                        <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">
                          <span title={format(new Date(r.created_at), "PPpp")}>
                            {formatDistanceToNow(new Date(r.created_at), {
                              addSuffix: true,
                            })}
                          </span>
                        </td>
                        <td className="py-2 text-xs text-muted-foreground break-words">
                          {r.error_message ?? "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
