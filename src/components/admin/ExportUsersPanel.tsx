import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  getAdminUserDirectory,
  type AdminDirectoryRow,
} from "@/lib/admin-directory.functions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, FilterX, Loader2 } from "lucide-react";
import { toast } from "sonner";

const COLUMNS = [
  "id",
  "email",
  "display_name",
  "last_sign_in_at",
  "email_confirmed_at",
  "created_at",
  "updated_at",
  "onboarding_completed",
  "discoverable",
  "bio",
  "birthdate",
  "gender",
  "pronouns",
  "location_consent_given",
  "location_consent_date",
  "data_processing_consent",
  "data_processing_consent_date",
  "instagram_url",
  "twitter_url",
  "facebook_url",
  "linkedin_url",
  "tiktok_url",
] as const;

type Column = (typeof COLUMNS)[number];

// Auth-directory fields come from the admin-only directory RPC (auth.users
// join); everything else comes from public.profiles.
const DIRECTORY_COLS: ReadonlySet<Column> = new Set([
  "email",
  "last_sign_in_at",
  "email_confirmed_at",
]);

// `id` is always included so exported rows remain identifiable.
const REQUIRED: Column[] = ["id"];
const DEFAULT_SELECTED: Column[] = [
  "id",
  "email",
  "display_name",
  "created_at",
  "last_sign_in_at",
  "onboarding_completed",
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
  const fetchDirectory = useServerFn(getAdminUserDirectory);
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
    if (!selectedCols.some((c) => !REQUIRED.includes(c))) {
      toast.error("Pick at least one field to export");
      return;
    }
    setLoading(true);
    try {
      // Authoritative account list (every auth user, even without a profile).
      const directory = await fetchDirectory();

      const wantsProfiles = selectedCols.some((c) => !DIRECTORY_COLS.has(c));
      const profileById = new Map<string, Record<string, unknown>>();
      if (wantsProfiles) {
        const profileCols = selectedCols.filter(
          (c) => !DIRECTORY_COLS.has(c) && c !== "id",
        );
        // Always fetch id so we can join directory rows by user.
        const select = ["id", ...profileCols].join(",");
        const pageSize = 1000;
        let from = 0;
        // Paginate to avoid PostgREST 1000-row cap.
        while (true) {
          const { data, error } = await supabase
            .from("profiles")
            .select(select)
            .range(from, from + pageSize - 1);
          if (error) throw error;
          if (!data || data.length === 0) break;
          for (const row of data as unknown as Record<string, unknown>[]) {
            profileById.set(row.id as string, row);
          }
          if (data.length < pageSize) break;
          from += pageSize;
        }
      }

      // Merge: one row per auth user, profile fields attached when present.
      const all = directory.map((u: AdminDirectoryRow) => {
        const profile = profileById.get(u.id) ?? {};
        return {
          ...profile,
          id: u.id,
          email: u.email,
          last_sign_in_at: u.last_sign_in_at,
          email_confirmed_at: u.email_confirmed_at,
          display_name: u.display_name ?? profile.display_name,
          onboarding_completed:
            u.onboarding_completed ?? profile.onboarding_completed,
          created_at: u.created_at ?? profile.created_at,
        };
      });

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
      toast.success(
        `Exported ${all.length} user${all.length === 1 ? "" : "s"}`,
      );
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
            Pick which fields to include, then download as CSV. Includes every
            registered account — even ones that never finished onboarding.
          </p>
        </div>
        <Button onClick={handleExport} disabled={loading} className="gap-2">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          {loading ? "Exporting…" : "Export CSV"}
        </Button>
      </div>

      <div className="mt-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Fields ({selectedCols.length}/{COLUMNS.length})
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={selectAll}
              disabled={loading}
            >
              Select all
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={selectNone}
              disabled={loading}
            >
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
                    <span className="ml-1 text-[10px] uppercase text-muted-foreground">
                      required
                    </span>
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
