import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Users, UserPlus, Download, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

type DirectoryUser = { id: string; email: string | null; display_name: string | null; created_at: string };
type ProvisionResult = {
  email: string;
  status: "created" | "exists" | "error";
  user_id?: string;
  password?: string;
  invited?: boolean;
  error?: string;
};

const BATCH_SIZE = 25;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function csvEscape(v: unknown) {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function BulkUserProvisionPanel() {
  const [directory, setDirectory] = useState<DirectoryUser[] | null>(null);
  const [loadingDirectory, setLoadingDirectory] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [manual, setManual] = useState("");
  const [sendInvite, setSendInvite] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<ProvisionResult[]>([]);

  const manualEntries = useMemo(
    () =>
      manual
        .split(/[\n,;]+/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [email, ...rest] = line.split(/[\t|]/).map((p) => p.trim());
          return { email: email.toLowerCase(), display_name: rest.join(" ") || null };
        })
        .filter((e) => EMAIL_RE.test(e.email)),
    [manual],
  );

  const payload = useMemo(() => {
    const byEmail = new Map<string, { email: string; display_name: string | null }>();
    (directory ?? [])
      .filter((u) => selected.has(u.id) && u.email && EMAIL_RE.test(u.email))
      .forEach((u) => byEmail.set(u.email!.toLowerCase(), { email: u.email!.toLowerCase(), display_name: u.display_name }));
    manualEntries.forEach((e) => byEmail.set(e.email, e));
    return [...byEmail.values()];
  }, [directory, selected, manualEntries]);

  const loadDirectory = async () => {
    setLoadingDirectory(true);
    try {
      const { data, error } = await supabase.rpc("admin_user_directory");
      if (error) throw error;
      const rows = (data ?? []).map((u) => ({
        id: u.id,
        email: u.email,
        display_name: u.display_name,
        created_at: u.created_at,
      })) as DirectoryUser[];
      setDirectory(rows);
      setSelected(new Set());
      toast.success(`Loaded ${rows.length} accounts from this environment`);
    } catch (err) {
      console.error("Load directory failed", err);
      toast.error("Failed to load accounts (admin role required)");
    } finally {
      setLoadingDirectory(false);
    }
  };

  const toggle = (id: string, checked: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });

  const run = async () => {
    if (payload.length === 0) {
      toast.error("Select accounts or paste emails first");
      return;
    }
    setRunning(true);
    setResults([]);
    setProgress({ done: 0, total: payload.length });
    const collected: ProvisionResult[] = [];
    try {
      for (let i = 0; i < payload.length; i += BATCH_SIZE) {
        const batch = payload.slice(i, i + BATCH_SIZE);
        const { data, error } = await supabase.functions.invoke("admin-bulk-provision-users", {
          body: { users: batch, sendInvite },
        });
        if (error) throw error;
        collected.push(...((data?.results ?? []) as ProvisionResult[]));
        setResults([...collected]);
        setProgress({ done: Math.min(i + BATCH_SIZE, payload.length), total: payload.length });
      }
      const created = collected.filter((r) => r.status === "created").length;
      const skipped = collected.filter((r) => r.status === "exists").length;
      const failed = collected.filter((r) => r.status === "error").length;
      toast.success(`${created} created · ${skipped} already existed · ${failed} failed`);
    } catch (err) {
      console.error("Bulk provisioning failed", err);
      toast.error("Bulk provisioning failed");
    } finally {
      setRunning(false);
    }
  };

  const downloadResults = () => {
    const cols = ["email", "status", "user_id", "password", "error"];
    const csv = [
      cols.join(","),
      ...results.map((r) => cols.map((c) => csvEscape((r as Record<string, unknown>)[c])).join(",")),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `jet-provisioned-users-${new Date().toISOString().replace(/[:.]/g, "-")}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-2xl border border-border/60 bg-card/60 backdrop-blur p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Re-create users</h2>
          <p className="text-sm text-muted-foreground">
            Bulk-provision accounts in the environment you are currently using.
          </p>
        </div>
        <Button onClick={run} disabled={running || payload.length === 0} className="gap-2">
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          {running ? `Provisioning ${progress.done}/${progress.total}…` : `Re-create ${payload.length || ""}`}
        </Button>
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
        <p>
          Accounts are created in whichever backend the app you are using is pointed at. Run this from the
          <strong> published site</strong> to populate the live Users list, and from the preview to populate test data.
          Passwords are generated per account and shown once — export the CSV.
        </p>
      </div>

      <div className="mt-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Accounts in this environment {directory ? `(${directory.length})` : ""}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={loadDirectory} disabled={loadingDirectory || running}>
              {loadingDirectory ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
              <span className="ml-1">Load</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!directory?.length || running}
              onClick={() => setSelected(new Set((directory ?? []).map((u) => u.id)))}
            >
              Select all
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={running} onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        </div>

        {directory && directory.length > 0 && (
          <div className="max-h-64 overflow-y-auto rounded-xl border border-border/50 divide-y divide-border/40">
            {directory.map((u) => (
              <label
                key={u.id}
                htmlFor={`prov-${u.id}`}
                className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-background/60 cursor-pointer"
              >
                <Checkbox
                  id={`prov-${u.id}`}
                  disabled={running || !u.email}
                  checked={selected.has(u.id)}
                  onCheckedChange={(v) => toggle(u.id, v === true)}
                />
                <span className="min-w-0 flex-1 truncate">{u.email ?? "—"}</span>
                <span className="hidden sm:block max-w-[10rem] truncate text-xs text-muted-foreground">
                  {u.display_name ?? ""}
                </span>
              </label>
            ))}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="manual-emails" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Or paste emails (one per line, optional <code>email | Display Name</code>)
          </Label>
          <Textarea
            id="manual-emails"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            disabled={running}
            rows={4}
            placeholder={"alex@example.com | Alex\nsam@example.com"}
            className="font-mono text-xs"
          />
          {manualEntries.length > 0 && (
            <p className="text-xs text-muted-foreground">{manualEntries.length} valid email(s) parsed</p>
          )}
        </div>

        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={sendInvite} disabled={running} onCheckedChange={(v) => setSendInvite(v === true)} />
          Send invite emails instead of setting a temporary password
        </label>
      </div>

      {results.length > 0 && (
        <div className="mt-5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Results ({results.length})
            </p>
            <Button type="button" variant="ghost" size="sm" onClick={downloadResults} className="gap-1">
              <Download className="h-4 w-4" /> CSV
            </Button>
          </div>
          <div className="max-h-64 overflow-y-auto rounded-xl border border-border/50 divide-y divide-border/40">
            {results.map((r) => (
              <div key={r.email} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{r.email}</span>
                <Badge
                  variant={r.status === "created" ? "default" : r.status === "exists" ? "secondary" : "destructive"}
                >
                  {r.status}
                </Badge>
                {r.password && <code className="hidden sm:block text-xs text-muted-foreground">{r.password}</code>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
