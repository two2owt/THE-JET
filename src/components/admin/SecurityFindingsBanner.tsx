import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ChevronDown, ChevronUp, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";

interface Finding {
  id: string;
  scanner_name: string;
  internal_id: string;
  title: string;
  severity: string;
  summary: string | null;
  status: string;
  created_at: string;
}

const severityRank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

function severityClass(sev: string) {
  switch (sev.toLowerCase()) {
    case "critical": return "bg-destructive/20 text-destructive border-destructive/40";
    case "high":     return "bg-destructive/15 text-destructive border-destructive/30";
    case "medium":   return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    case "low":      return "bg-blue-500/15 text-blue-300 border-blue-500/30";
    default:         return "bg-muted text-muted-foreground border-border";
  }
}

export function SecurityFindingsBanner() {
  const { user } = useAuth();
  const [unread, setUnread] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    // Fetch open findings the admin hasn't acked yet.
    const { data: findings, error } = await supabase
      .from("admin_security_findings")
      .select("id, scanner_name, internal_id, title, severity, summary, status, created_at")
      .eq("status", "open")
      .order("created_at", { ascending: false });
    if (error) { setLoading(false); return; }

    const { data: acks } = await supabase
      .from("admin_security_finding_acks")
      .select("finding_id")
      .eq("admin_id", user.id);

    const ackSet = new Set((acks ?? []).map((a) => a.finding_id));
    const filtered = (findings ?? [])
      .filter((f) => !ackSet.has(f.id))
      .sort((a, b) => (severityRank[a.severity.toLowerCase()] ?? 9) - (severityRank[b.severity.toLowerCase()] ?? 9));
    setUnread(filtered);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const markRead = async (id: string) => {
    if (!user) return;
    const prev = unread;
    setUnread((u) => u.filter((f) => f.id !== id));
    const { error } = await supabase
      .from("admin_security_finding_acks")
      .insert({ admin_id: user.id, finding_id: id });
    if (error) {
      setUnread(prev);
      toast.error("Couldn't mark as read");
    }
  };

  const markAllRead = async () => {
    if (!user || unread.length === 0) return;
    const rows = unread.map((f) => ({ admin_id: user.id, finding_id: f.id }));
    const prev = unread;
    setUnread([]);
    const { error } = await supabase.from("admin_security_finding_acks").insert(rows);
    if (error) {
      setUnread(prev);
      toast.error("Couldn't mark all as read");
    } else {
      toast.success(`Marked ${rows.length} finding${rows.length === 1 ? "" : "s"} as read`);
    }
  };

  if (loading || dismissed || unread.length === 0) return null;

  const topSeverity = unread[0]?.severity ?? "medium";

  return (
    <div
      role="alert"
      aria-live="polite"
      className="rounded-2xl border border-destructive/40 bg-destructive/10 backdrop-blur-md p-4 shadow-lg"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-foreground">
              {unread.length} new security finding{unread.length === 1 ? "" : "s"}
            </h3>
            <Badge variant="outline" className={severityClass(topSeverity)}>
              top: {topSeverity}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Detected since your last visit. Review and mark as read.
          </p>

          {expanded && (
            <ul className="mt-3 flex flex-col gap-2">
              {unread.map((f) => (
                <li
                  key={f.id}
                  className="rounded-xl border border-border/60 bg-background/40 p-3 flex items-start gap-3"
                >
                  <Badge variant="outline" className={`${severityClass(f.severity)} shrink-0`}>
                    {f.severity}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-foreground truncate">{f.title}</div>
                    {f.summary && (
                      <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{f.summary}</div>
                    )}
                    <div className="text-[11px] text-muted-foreground/70 mt-1">
                      {f.scanner_name} · {f.internal_id}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => markRead(f.id)}
                    aria-label={`Mark ${f.title} as read`}
                  >
                    Mark read
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-2 mt-3">
            <Button size="sm" variant="outline" onClick={() => setExpanded((v) => !v)}>
              {expanded ? <ChevronUp className="h-4 w-4 mr-1" /> : <ChevronDown className="h-4 w-4 mr-1" />}
              {expanded ? "Hide details" : "View details"}
            </Button>
            <Button size="sm" onClick={markAllRead}>
              <ShieldCheck className="h-4 w-4 mr-1" />
              Mark all as read
            </Button>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss banner"
          className="text-muted-foreground hover:text-foreground p-1 -m-1"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}