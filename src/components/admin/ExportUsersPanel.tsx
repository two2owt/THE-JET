import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

const COLUMNS = [
  "id", "email", "display_name", "bio", "created_at", "updated_at",
  "onboarding_completed", "discoverable", "birthdate", "gender", "pronouns",
  "location_consent_given", "location_consent_date",
  "data_processing_consent", "data_processing_consent_date",
  "instagram_url", "twitter_url", "facebook_url", "linkedin_url", "tiktok_url",
] as const;

type Column = (typeof COLUMNS)[number];

// `id` is always included so exported rows remain identifiable.
const REQUIRED: Column[] = ["id"];
const DEFAULT_SELECTED: Column[] = [
  "id", "email", "display_name", "created_at", "onboarding_completed",
];

function toCsv(rows: Record<string, unknown>[], cols: Column[]): string {
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = cols.join(",");
  const body = rows.map((r) => cols.map((c) => esc(r[c])).join(",")).join("\n");
  return `${header}\n${body}`;
}

export function ExportUsersPanel() {
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<Column>>(
    () => new Set(DEFAULT_SELECTED),
  );

  const selectedCols = useMemo<Column[]>(
    () => COLUMNS.filter((c) => selected.has(c)),
    [selected],
  );

  const toggle = (col: Column, checked: boolean) => {
    if (REQUIRED.includes(col)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(col);
      else next.delete(col);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(COLUMNS));
  const selectNone = () => setSelected(new Set(REQUIRED));

  const handleExport = async () => {
    if (selectedCols.length <= REQUIRED.length && !selectedCols.some((c) => !REQUIRED.includes(c))) {
      toast.error("Pick at least one field to export");
      return;
    }
    setLoading(true);
    try {
      const wantsEmail = selected.has("email");
      const profileCols = selectedCols.filter((c) => c !== "email");
      // Always fetch id so we can join emails and dedupe by user.
      if (!profileCols.includes("id")) profileCols.unshift("id");

      const pageSize = 1000;
      let from = 0;
      const all: Record<string, unknown>[] = [];
      // Paginate to avoid PostgREST 1000-row cap.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await supabase
          .from("profiles")
          .select(profileCols.join(","))
          .order("created_at", { ascending: false })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all.push(...(data as unknown as Record<string, unknown>[]));
        if (data.length < pageSize) break;
        from += pageSize;
      }

      // Attach emails from auth.users via admin-only RPC when requested.
      if (wantsEmail) {
        const { data: emailRows, error: emailErr } = await supabase.rpc(
          "admin_list_user_emails",
        );
        if (emailErr) throw emailErr;
        const emailById = new Map<string, string>(
          (emailRows ?? []).map((r: { id: string; email: string | null }) => [
            r.id,
            r.email ?? "",
          ]),
        );
        for (const row of all) {
          row.email = emailById.get(row.id as string) ?? "";
        }
      }

      const csv = toCsv(all, selectedCols);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      a.href = url;
      a.download = `jet-users-${stamp}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${all.length} user${all.length === 1 ? "" : "s"}`);
    } catch (err) {
      console.error("Export users failed", err);
      toast.error("Failed to export users");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border/60 bg-card/60 backdrop-blur p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Export users</h2>
          <p className="text-sm text-muted-foreground">
            Pick which fields to include, then download as CSV.
          </p>
        </div>
        <Button onClick={handleExport} disabled={loading} className="gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {loading ? "Exporting…" : "Export CSV"}
        </Button>
      </div>

      <div className="mt-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Fields ({selectedCols.length}/{COLUMNS.length})
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={selectAll} disabled={loading}>
              Select all
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={selectNone} disabled={loading}>
              Clear
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
          {COLUMNS.map((col) => {
            const id = `export-col-${col}`;
            const required = REQUIRED.includes(col);
            return (
              <label
                key={col}
                htmlFor={id}
                className="flex items-center gap-2 rounded-lg border border-border/50 bg-background/40 px-3 py-2 text-sm hover:bg-background/70 cursor-pointer"
              >
                <Checkbox
                  id={id}
                  checked={selected.has(col)}
                  disabled={required || loading}
                  onCheckedChange={(v) => toggle(col, v === true)}
                />
                <Label htmlFor={id} className="cursor-pointer font-normal">
                  {col}
                  {required && (
                    <span className="ml-1 text-[10px] uppercase text-muted-foreground">required</span>
                  )}
                </Label>
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}