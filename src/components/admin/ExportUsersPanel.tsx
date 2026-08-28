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

// --- Export filters -------------------------------------------------------

type TriState = "all" | "yes" | "no";
type Tier = "free" | "jet_plus" | "jetx";
const TIER_OPTIONS: Tier[] = ["free", "jet_plus", "jetx"];
const TIER_LABELS: Record<Tier, string> = {
  free: "Free",
  jet_plus: "JET+",
  jetx: "JETx",
};

interface ExportFilters {
  onboarding: TriState;
  emailConfirmed: TriState;
  lastSignInFrom: string; // YYYY-MM-DD
  lastSignInTo: string; // YYYY-MM-DD
  neverSignedIn: boolean;
  tiers: Tier[]; // empty = all tiers
}

const defaultExportFilters: ExportFilters = {
  onboarding: "all",
  emailConfirmed: "all",
  lastSignInFrom: "",
  lastSignInTo: "",
  neverSignedIn: false,
  tiers: [],
};

function filtersActive(f: ExportFilters): boolean {
  return (
    f.onboarding !== "all" ||
    f.emailConfirmed !== "all" ||
    f.lastSignInFrom !== "" ||
    f.lastSignInTo !== "" ||
    f.neverSignedIn ||
    f.tiers.length > 0
  );
}

/** Derive an effective tier: active paid subscriptions win, else free. */
function effectiveTier(sub: { tier: string; subscribed: boolean; subscription_end: string | null } | undefined): Tier {
  if (!sub || !sub.subscribed) return "free";
  if (sub.subscription_end && new Date(sub.subscription_end) < new Date())
    return "free";
  return sub.tier === "jetx" || sub.tier === "jet_plus" ? sub.tier : "free";
}

function passesFilters(
  row: Record<string, unknown>,
  f: ExportFilters,
): boolean {
  if (f.onboarding !== "all") {
    const done = row.onboarding_completed === true;
    if (f.onboarding === "yes" ? !done : done) return false;
  }
  if (f.emailConfirmed !== "all") {
    const confirmed = Boolean(row.email_confirmed_at);
    if (f.emailConfirmed === "yes" ? !confirmed : confirmed) return false;
  }
  const lastSignIn = row.last_sign_in_at ? String(row.last_sign_in_at) : null;
  if (f.neverSignedIn && lastSignIn) return false;
  if (f.lastSignInFrom) {
    if (!lastSignIn || new Date(lastSignIn) < new Date(f.lastSignInFrom))
      return false;
  }
  if (f.lastSignInTo) {
    if (!lastSignIn || new Date(lastSignIn) > new Date(`${f.lastSignInTo}T23:59:59`))
      return false;
  }
  if (f.tiers.length && !f.tiers.includes(row._tier as Tier)) return false;
  return true;
}

function toCsv(rows: Record<string, unknown>[], cols: readonly string[]): string {
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
  const [filters, setFilters] = useState<ExportFilters>(defaultExportFilters);

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

      // Tier lookup — only fetched when a tier filter is active. Admins
      // bypass RLS on `subscribers`; everyone resolves to their own row.
      const tierById = new Map<string, Tier>();
      if (filters.tiers.length) {
        const { data, error } = await supabase
          .from("subscribers")
          .select("user_id, tier, subscribed, subscription_end");
        if (error) throw error;
        for (const row of data ?? []) {
          tierById.set(row.user_id, effectiveTier(row));
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
          _tier: tierById.get(u.id) ?? "free",
        };
      });

      const filtered = filtersActive(filters)
        ? all.filter((r) => passesFilters(r, filters))
        : all;

      // Surface the tier as a real column whenever the tier filter is used.
      const exportCols: string[] = filters.tiers.length
        ? [...selectedCols, "tier"]
        : [...selectedCols];
      const rowsForCsv = filtered.map(({ _tier, ...rest }) => ({
        ...rest,
        ...(filters.tiers.length ? { tier: _tier } : {}),
      }));

      const csv = toCsv(rowsForCsv, exportCols);
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
        `Exported ${filtered.length} of ${all.length} user${all.length === 1 ? "" : "s"}`,
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

      <div className="mt-5 rounded-xl border border-border/50 bg-background/30 p-4 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Filters {filtersActive(filters) && "· active"}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={() => setFilters(defaultExportFilters)}
            disabled={loading || !filtersActive(filters)}
          >
            <FilterX className="h-3.5 w-3.5" />
            Reset
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Onboarding</Label>
            <Select
              value={filters.onboarding}
              onValueChange={(v) =>
                setFilters((f) => ({ ...f, onboarding: v as TriState }))
              }
              disabled={loading}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All users</SelectItem>
                <SelectItem value="yes">Completed</SelectItem>
                <SelectItem value="no">Not completed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Email confirmed</Label>
            <Select
              value={filters.emailConfirmed}
              onValueChange={(v) =>
                setFilters((f) => ({ ...f, emailConfirmed: v as TriState }))
              }
              disabled={loading}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="yes">Confirmed</SelectItem>
                <SelectItem value="no">Unconfirmed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="export-lastsignin-from" className="text-xs text-muted-foreground">
              Last sign-in from
            </Label>
            <Input
              id="export-lastsignin-from"
              type="date"
              value={filters.lastSignInFrom}
              onChange={(e) =>
                setFilters((f) => ({ ...f, lastSignInFrom: e.target.value }))
              }
              disabled={loading || filters.neverSignedIn}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="export-lastsignin-to" className="text-xs text-muted-foreground">
              Last sign-in to
            </Label>
            <Input
              id="export-lastsignin-to"
              type="date"
              value={filters.lastSignInTo}
              onChange={(e) =>
                setFilters((f) => ({ ...f, lastSignInTo: e.target.value }))
              }
              disabled={loading || filters.neverSignedIn}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <label
            htmlFor="export-never-signed-in"
            className="flex items-center gap-2 text-sm cursor-pointer"
          >
            <Checkbox
              id="export-never-signed-in"
              checked={filters.neverSignedIn}
              disabled={loading}
              onCheckedChange={(v) =>
                setFilters((f) => ({
                  ...f,
                  neverSignedIn: v === true,
                  ...(v === true
                    ? { lastSignInFrom: "", lastSignInTo: "" }
                    : {}),
                }))
              }
            />
            <span>Never signed in only</span>
          </label>

          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">Tier:</span>
            {TIER_OPTIONS.map((tier) => {
              const id = `export-tier-${tier}`;
              const checked = filters.tiers.includes(tier);
              return (
                <label
                  key={tier}
                  htmlFor={id}
                  className="flex items-center gap-1.5 text-sm cursor-pointer"
                >
                  <Checkbox
                    id={id}
                    checked={checked}
                    disabled={loading}
                    onCheckedChange={(v) =>
                      setFilters((f) => ({
                        ...f,
                        tiers:
                          v === true
                            ? [...f.tiers, tier]
                            : f.tiers.filter((t) => t !== tier),
                      }))
                    }
                  />
                  <span>{TIER_LABELS[tier]}</span>
                </label>
              );
            })}
            <span className="text-[10px] text-muted-foreground">
              (none selected = all tiers)
            </span>
          </div>
        </div>
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
