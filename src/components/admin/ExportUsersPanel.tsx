import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

const COLUMNS = [
  "id", "display_name", "bio", "created_at", "updated_at",
  "onboarding_completed", "discoverable", "birthdate", "gender", "pronouns",
  "location_consent_given", "location_consent_date",
  "data_processing_consent", "data_processing_consent_date",
  "instagram_url", "twitter_url", "facebook_url", "linkedin_url", "tiktok_url",
] as const;

function toCsv(rows: Record<string, unknown>[]): string {
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = COLUMNS.join(",");
  const body = rows.map((r) => COLUMNS.map((c) => esc(r[c])).join(",")).join("\n");
  return `${header}\n${body}`;
}

export function ExportUsersPanel() {
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    try {
      const pageSize = 1000;
      let from = 0;
      const all: Record<string, unknown>[] = [];
      // Paginate to avoid PostgREST 1000-row cap.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await supabase
          .from("profiles")
          .select(COLUMNS.join(","))
          .order("created_at", { ascending: false })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all.push(...(data as unknown as Record<string, unknown>[]));
        if (data.length < pageSize) break;
        from += pageSize;
      }

      const csv = toCsv(all);
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
            Download all user profiles as a CSV file.
          </p>
        </div>
        <Button onClick={handleExport} disabled={loading} className="gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {loading ? "Exporting…" : "Export CSV"}
        </Button>
      </div>
    </div>
  );
}