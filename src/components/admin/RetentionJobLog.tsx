import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { format } from "date-fns";

interface RetentionRow {
  id: string;
  job_name: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  rows_archived: number | null;
  rows_obfuscated: number | null;
  rows_deleted: number | null;
  error_message: string | null;
  rows_expected: number | null;
  validation_status: string | null;
}

type StatusFilter = "all" | "success" | "running" | "failed";

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "success" || status === "completed") return "default";
  if (status === "running") return "secondary";
  if (status === "failed" || status === "error" || status === "mismatch") return "destructive";
  return "outline";
}

function validationBadge(v: string | null): { label: string; variant: "default" | "secondary" | "destructive" | "outline" } | null {
  if (!v) return null;
  if (v === "ok") return { label: "ok", variant: "default" };
  if (v === "mismatch") return { label: "mismatch", variant: "destructive" };
  if (v === "error") return { label: "error", variant: "destructive" };
  return { label: v, variant: "outline" };
}

function toDateInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function RetentionJobLog() {
  const today = useMemo(() => new Date(), []);
  const defaultStart = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    return d;
  }, []);

  const [startDate, setStartDate] = useState<string>(toDateInput(defaultStart));
  const [endDate, setEndDate] = useState<string>(toDateInput(today));
  const [status, setStatus] = useState<StatusFilter>("all");
  const [rows, setRows] = useState<RetentionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      const startIso = new Date(`${startDate}T00:00:00`).toISOString();
      const endIso = new Date(`${endDate}T23:59:59.999`).toISOString();
      let q = supabase
        .from("data_retention_job_log" as never)
        .select("id, job_name, status, started_at, completed_at, rows_archived, rows_obfuscated, rows_deleted, error_message, rows_expected, validation_status")
        .gte("started_at", startIso)
        .lte("started_at", endIso)
        .order("started_at", { ascending: false })
        .limit(500);
      if (status !== "all") q = q.eq("status", status);
      const { data, error } = await q.returns<RetentionRow[]>();
      if (cancelled) return;
      if (error) setError(error.message);
      else setRows(data ?? []);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [startDate, endDate, status]);

  const chartData = useMemo(() => {
    const byDay = new Map<string, { date: string; archived: number; obfuscated: number; deleted: number }>();
    for (const r of rows) {
      const day = r.started_at.slice(0, 10);
      const entry = byDay.get(day) ?? { date: day, archived: 0, obfuscated: 0, deleted: 0 };
      entry.archived += r.rows_archived ?? 0;
      entry.obfuscated += r.rows_obfuscated ?? 0;
      entry.deleted += r.rows_deleted ?? 0;
      byDay.set(day, entry);
    }
    return Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [rows]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => ({
        runs: acc.runs + 1,
        archived: acc.archived + (r.rows_archived ?? 0),
        obfuscated: acc.obfuscated + (r.rows_obfuscated ?? 0),
        deleted: acc.deleted + (r.rows_deleted ?? 0),
        failed: acc.failed + (r.status === "failed" || r.status === "error" ? 1 : 0),
        mismatches: acc.mismatches + (r.validation_status === "mismatch" ? 1 : 0),
      }),
      { runs: 0, archived: 0, obfuscated: 0, deleted: 0, failed: 0, mismatches: 0 },
    );
  }, [rows]);

  return (
    <div className="flex flex-col gap-4">
      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ret-start">Start date</Label>
              <Input id="ret-start" type="date" value={startDate} max={endDate}
                onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ret-end">End date</Label>
              <Input id="ret-end" type="date" value={endDate} min={startDate}
                max={toDateInput(today)} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ret-status">Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
                <SelectTrigger id="ret-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="success">Success</SelectItem>
                  <SelectItem value="running">Running</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Totals */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {[
          { label: "Runs", value: totals.runs },
          { label: "Archived", value: totals.archived },
          { label: "Obfuscated", value: totals.obfuscated },
          { label: "Deleted", value: totals.deleted },
          { label: "Failed", value: totals.failed },
          { label: "Mismatches", value: totals.mismatches },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-4">
              <div className="text-xs text-muted-foreground">{s.label}</div>
              <div className="text-2xl font-semibold">{s.value.toLocaleString()}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Trend chart */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Archived row-count trend</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-[260px] w-full" />
          ) : chartData.length === 0 ? (
            <div className="text-sm text-muted-foreground py-10 text-center">
              No retention job runs in the selected range.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="archived" stackId="a" fill="hsl(var(--primary))" name="Archived" />
                <Bar dataKey="obfuscated" stackId="a" fill="hsl(var(--secondary))" name="Obfuscated" />
                <Bar dataKey="deleted" stackId="a" fill="hsl(var(--muted-foreground))" name="Deleted" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Job runs</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {error && (
            <div className="p-4 text-sm text-destructive">{error}</div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground border-b border-border">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Started</th>
                  <th className="text-left px-4 py-2 font-medium">Job</th>
                  <th className="text-left px-4 py-2 font-medium">Status</th>
                  <th className="text-left px-4 py-2 font-medium">Validation</th>
                  <th className="text-right px-4 py-2 font-medium">Expected</th>
                  <th className="text-right px-4 py-2 font-medium">Archived</th>
                  <th className="text-right px-4 py-2 font-medium">Obfuscated</th>
                  <th className="text-right px-4 py-2 font-medium">Deleted</th>
                  <th className="text-left px-4 py-2 font-medium">Error</th>
                </tr>
              </thead>
              <tbody>
                {loading && rows.length === 0 ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/50">
                      <td colSpan={9} className="px-4 py-3"><Skeleton className="h-5 w-full" /></td>
                    </tr>
                  ))
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-6 text-center text-muted-foreground">
                      No entries.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => {
                    const vb = validationBadge(r.validation_status);
                    const mismatch = r.validation_status === "mismatch";
                    return (
                    <tr key={r.id} className={`border-b border-border/50 hover:bg-muted/30 ${mismatch ? "bg-destructive/5" : ""}`}>
                      <td className="px-4 py-2 whitespace-nowrap">
                        {format(new Date(r.started_at), "MMM d, HH:mm")}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">{r.job_name}</td>
                      <td className="px-4 py-2">
                        <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
                      </td>
                      <td className="px-4 py-2">
                        {vb ? <Badge variant={vb.variant}>{vb.label}</Badge> : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{r.rows_expected != null ? r.rows_expected.toLocaleString() : "—"}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{(r.rows_archived ?? 0).toLocaleString()}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{(r.rows_obfuscated ?? 0).toLocaleString()}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{(r.rows_deleted ?? 0).toLocaleString()}</td>
                      <td className="px-4 py-2 max-w-[280px] truncate text-destructive/80" title={r.error_message ?? ""}>
                        {r.error_message ?? "—"}
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}