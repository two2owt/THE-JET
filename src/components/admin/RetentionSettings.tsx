import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
// Types are regenerated after migration approval; use a loose client cast in the meantime.
const db = supabase as unknown as {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
};
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface RetentionSettings {
  live_retention_days: number;
  obfuscate_after_days: number;
  cron_schedule: string;
  updated_at: string | null;
}

/** Simple 5-field cron shape check (minute hour dom month dow). */
function isValidCron(expr: string): boolean {
  const parts = expr.trim().split(/\s+/);
  return parts.length === 5 && parts.every((p) => /^[\d*/,\-]+$/.test(p));
}

export function RetentionSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<RetentionSettings | null>(null);
  const [liveDays, setLiveDays] = useState("30");
  const [obfDays, setObfDays] = useState("7");
  const [cron, setCron] = useState("15 3 * * *");

  useEffect(() => {
    (async () => {
      const { data, error } = await db
        .from("retention_settings")
        .select("live_retention_days, obfuscate_after_days, cron_schedule, updated_at")
        .eq("id", true)
        .maybeSingle();
      if (error) {
        toast.error(`Failed to load retention settings: ${error.message}`);
      } else if (data) {
        const s = data as RetentionSettings;
        setSettings(s);
        setLiveDays(String(s.live_retention_days));
        setObfDays(String(s.obfuscate_after_days));
        setCron(s.cron_schedule);
      }
      setLoading(false);
    })();
  }, []);

  const live = Number(liveDays);
  const obf = Number(obfDays);
  const validNums =
    Number.isInteger(live) && live >= 1 && live <= 3650 &&
    Number.isInteger(obf) && obf >= 0 && obf < live;
  const validCron = isValidCron(cron);
  const canSave = validNums && validCron && !saving;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    const { data: userRes } = await supabase.auth.getUser();
    const { error } = await db
      .from("retention_settings")
      .update({
        live_retention_days: live,
        obfuscate_after_days: obf,
        cron_schedule: cron,
        updated_by: userRes.user?.id ?? null,
      })
      .eq("id", true);
    if (error) {
      toast.error(`Save failed: ${error.message}`);
      setSaving(false);
      return;
    }
    const { error: rpcErr } = await db.rpc("apply_retention_schedule");
    if (rpcErr) {
      toast.error(`Saved values, but rescheduling failed: ${rpcErr.message}`);
    } else {
      toast.success("Retention settings saved and cron schedule updated.");
    }
    setSettings({
      live_retention_days: live,
      obfuscate_after_days: obf,
      cron_schedule: cron,
      updated_at: new Date().toISOString(),
    });
    setSaving(false);
  }

  async function runNow() {
    // Best-effort: call the SECURITY DEFINER retention fn via RPC only if permitted.
    // Currently only service_role can execute; surface a clean toast either way.
    const { error } = await db.rpc("process_location_data_retention");
    if (error) {
      toast.info("Manual run isn't available from the client (service-role only). Job will run on the next cron tick.");
    } else {
      toast.success("Retention job triggered.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Retention configuration</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {loading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="live-days">Live retention (days)</Label>
                <Input
                  id="live-days"
                  type="number"
                  min={1}
                  max={3650}
                  value={liveDays}
                  onChange={(e) => setLiveDays(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Rows older than this are moved from <code>user_locations</code> to the archive.
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="obf-days">Obfuscate after (days)</Label>
                <Input
                  id="obf-days"
                  type="number"
                  min={0}
                  max={3650}
                  value={obfDays}
                  onChange={(e) => setObfDays(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Must be less than live retention. Coordinates are rounded to ~110m precision.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cron">Cron schedule (UTC)</Label>
              <Input
                id="cron"
                value={cron}
                onChange={(e) => setCron(e.target.value)}
                placeholder="15 3 * * *"
                spellCheck={false}
              />
              <p className="text-xs text-muted-foreground">
                Standard 5-field cron. Default <code>15 3 * * *</code> runs daily at 03:15 UTC.
              </p>
              {!validCron && cron.length > 0 && (
                <p className="text-xs text-destructive">Invalid cron expression.</p>
              )}
            </div>

            {!validNums && (
              <p className="text-xs text-destructive">
                Days must be integers with obfuscate &lt; live retention (1–3650).
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button onClick={save} disabled={!canSave}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save settings
              </Button>
              <Button variant="outline" onClick={runNow}>Run now</Button>
              {settings?.updated_at && (
                <span className="text-xs text-muted-foreground ml-auto">
                  Last updated {new Date(settings.updated_at).toLocaleString()}
                </span>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}