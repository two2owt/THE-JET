import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  ShieldAlert, ShieldCheck, RefreshCw, CheckCircle2, Loader2, EyeOff, Check,
} from "lucide-react";

type Severity = "critical" | "high" | "medium" | "low" | "info";
type Status = "open" | "fixed" | "ignored";

interface Finding {
  id: string;
  scanner_name: string;
  internal_id: string;
  title: string;
  severity: string;
  summary: string | null;
  status: string;
  fixed_at: string | null;
  created_at: string;
  updated_at: string;
}

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0, high: 1, medium: 2, low: 3, info: 4,
};

const SEVERITY_STYLES: Record<string, string> = {
  critical: "border-destructive/50 bg-destructive/15 text-destructive",
  high: "border-destructive/40 bg-destructive/10 text-destructive",
  medium: "border-primary/40 bg-primary/10 text-primary",
  low: "border-border bg-muted/40 text-muted-foreground",
  info: "border-border bg-muted/30 text-muted-foreground",
};

/**
 * Recommended remediation guidance. Matched on keywords in the finding's
 * internal_id/title so new scanner findings still get useful advice.
 */
const ACTION_RULES: { match: RegExp; action: string }[] = [
  { match: /rls|row_level|policy/i, action: "Review the table's RLS policies: scope every policy to auth.uid() (or has_role) and confirm GRANTs match the intended roles." },
  { match: /public_select|anon_select|public_read/i, action: "Drop the broad public/anon SELECT policy and replace it with an owner- or role-scoped policy." },
  { match: /insert/i, action: "Restrict the INSERT policy with a WITH CHECK clause that binds rows to the authenticated user." },
  { match: /security_definer/i, action: "Revoke EXECUTE from anon/PUBLIC on SECURITY DEFINER functions and pin search_path = public." },
  { match: /leaked_password|hibp|password/i, action: "Enable leaked-password (HIBP) protection and enforce a minimum password length in auth settings." },
  { match: /no_auth|verify_jwt|unauthenticated/i, action: "Require a valid JWT on the edge function, or add IP rate limiting if the endpoint must stay public." },
  { match: /realtime|publication/i, action: "Remove sensitive tables from the realtime publication so row changes are not broadcast." },
  { match: /storage|bucket/i, action: "Tighten storage policies so objects are readable only by their owner or an accepted connection." },
  { match: /supply_chain|dependency|npm/i, action: "Upgrade the vulnerable package in package.json and regenerate the lockfile." },
  { match: /mfa|otp|expiry/i, action: "Shorten OTP expiry and enable additional MFA factors in auth settings." },
];

const SEVERITY_FALLBACK: Record<string, string> = {
  critical: "Treat as a live incident: patch immediately and audit access logs for exploitation.",
  high: "Schedule a fix this cycle and verify with a re-scan before the next release.",
  medium: "Queue for the next hardening pass and re-scan to confirm.",
  low: "Track as hygiene work; fix opportunistically.",
  info: "No action required beyond keeping the configuration documented.",
};

function recommendedAction(f: Finding): string {
  const haystack = `${f.internal_id} ${f.title}`;
  const rule = ACTION_RULES.find((r) => r.match.test(haystack));
  return rule?.action ?? SEVERITY_FALLBACK[f.severity] ?? SEVERITY_FALLBACK.medium;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  });
}

export function SecurityFindingsPanel() {
  const [loading, setLoading] = useState(true);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [acks, setAcks] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<Severity | "all">("all");
  const [statusFilter, setStatusFilter] = useState<Status | "all">("open");

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: rows, error }, { data: user }] = await Promise.all([
      supabase
        .from("admin_security_findings")
        .select("id, scanner_name, internal_id, title, severity, summary, status, fixed_at, created_at, updated_at")
        .order("updated_at", { ascending: false }),
      supabase.auth.getUser(),
    ]);

    if (error) {
      toast.error(`Failed to load security findings: ${error.message}`);
      setFindings([]);
    } else {
      setFindings((rows ?? []) as Finding[]);
    }

    const uid = user?.user?.id;
    if (uid) {
      const { data: ackRows } = await supabase
        .from("admin_security_finding_acks")
        .select("finding_id")
        .eq("admin_id", uid);
      setAcks(new Set((ackRows ?? []).map((r: { finding_id: string }) => r.finding_id)));
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const acknowledge = useCallback(async (findingId: string) => {
    setBusyId(findingId);
    const { data: user } = await supabase.auth.getUser();
    const uid = user?.user?.id;
    if (!uid) { setBusyId(null); return; }
    const { error } = await supabase
      .from("admin_security_finding_acks")
      .insert({ admin_id: uid, finding_id: findingId });
    if (error && !/duplicate key/i.test(error.message)) {
      toast.error(`Could not acknowledge: ${error.message}`);
    } else {
      setAcks((prev) => new Set(prev).add(findingId));
      toast.success("Finding acknowledged");
    }
    setBusyId(null);
  }, []);

  const setStatus = useCallback(async (findingId: string, status: Status) => {
    setBusyId(findingId);
    const { error } = await supabase
      .from("admin_security_findings")
      .update({ status, fixed_at: status === "fixed" ? new Date().toISOString() : null })
      .eq("id", findingId);
    if (error) {
      toast.error(`Could not update finding: ${error.message}`);
    } else {
      setFindings((prev) =>
        prev.map((f) => (f.id === findingId
          ? { ...f, status, fixed_at: status === "fixed" ? new Date().toISOString() : null }
          : f)),
      );
      toast.success(status === "fixed" ? "Marked as fixed" : "Marked as ignored");
    }
    setBusyId(null);
  }, []);

  const counts = useMemo(() => {
    const open = findings.filter((f) => f.status === "open");
    return {
      open: open.length,
      critical: open.filter((f) => f.severity === "critical").length,
      high: open.filter((f) => f.severity === "high").length,
      fixed: findings.filter((f) => f.status === "fixed").length,
    };
  }, [findings]);

  const visible = useMemo(() => {
    return findings
      .filter((f) => (statusFilter === "all" ? true : f.status === statusFilter))
      .filter((f) => (severityFilter === "all" ? true : f.severity === severityFilter))
      .sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9));
  }, [findings, statusFilter, severityFilter]);

  return (
    <div className="flex flex-col" style={{ gap: "var(--space-md)" }}>
      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[
          { label: "Open findings", value: counts.open, icon: ShieldAlert },
          { label: "Critical", value: counts.critical, icon: ShieldAlert },
          { label: "High", value: counts.high, icon: ShieldAlert },
          { label: "Fixed", value: counts.fixed, icon: ShieldCheck },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="pt-5 pb-4 flex items-center gap-3">
              <Icon className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0">
                <div className="text-2xl font-display leading-none">{loading ? "—" : value}</div>
                <p className="text-xs text-muted-foreground truncate">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="font-display">Security findings</CardTitle>
              <CardDescription>
                Latest scan results with severity and recommended remediation.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              {loading
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <RefreshCw className="h-4 w-4" />}
              <span className="ml-2">Refresh</span>
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as Status | "all")}>
              <SelectTrigger className="w-[150px] min-h-11" aria-label="Filter by status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="fixed">Fixed</SelectItem>
                <SelectItem value="ignored">Ignored</SelectItem>
                <SelectItem value="all">All statuses</SelectItem>
              </SelectContent>
            </Select>
            <Select value={severityFilter} onValueChange={(v) => setSeverityFilter(v as Severity | "all")}>
              <SelectTrigger className="w-[170px] min-h-11" aria-label="Filter by severity">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All severities</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="info">Info</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-3">
          {loading && Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-2xl" />
          ))}

          {!loading && visible.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <ShieldCheck className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">
                No findings match these filters. Run a security scan to refresh results.
              </p>
            </div>
          )}

          {!loading && visible.map((f) => {
            const acked = acks.has(f.id);
            const busy = busyId === f.id;
            return (
              <article
                key={f.id}
                className="rounded-2xl border border-border/60 bg-card/40 p-4 flex flex-col gap-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold leading-snug break-words">{f.title}</h3>
                    <p className="text-xs text-muted-foreground break-all">
                      {f.scanner_name} · {f.internal_id}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className={`capitalize ${SEVERITY_STYLES[f.severity] ?? SEVERITY_STYLES.medium}`}
                    >
                      {f.severity}
                    </Badge>
                    <Badge variant="outline" className="capitalize">{f.status}</Badge>
                    {acked && (
                      <Badge variant="outline" className="gap-1">
                        <Check className="h-3 w-3" aria-hidden="true" /> Acknowledged
                      </Badge>
                    )}
                  </div>
                </div>

                {f.summary && (
                  <p className="text-sm text-muted-foreground break-words">{f.summary}</p>
                )}

                <div className="rounded-xl border border-border/50 bg-muted/30 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Recommended action
                  </p>
                  <p className="text-sm mt-1 break-words">{recommendedAction(f)}</p>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    First seen {formatDate(f.created_at)}
                    {f.fixed_at ? ` · Fixed ${formatDate(f.fixed_at)}` : ""}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {!acked && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => void acknowledge(f.id)}
                      >
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        <span className="ml-2">Acknowledge</span>
                      </Button>
                    )}
                    {f.status !== "fixed" && (
                      <Button size="sm" disabled={busy} onClick={() => void setStatus(f.id, "fixed")}>
                        <CheckCircle2 className="h-4 w-4" />
                        <span className="ml-2">Mark fixed</span>
                      </Button>
                    )}
                    {f.status === "open" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => void setStatus(f.id, "ignored")}
                      >
                        <EyeOff className="h-4 w-4" />
                        <span className="ml-2">Ignore</span>
                      </Button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}