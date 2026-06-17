import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Action = "create" | "update" | "delete";

const PLACEHOLDER_JSON = `{
  "venue_id": "venue-123",
  "venue_name": "Example Venue",
  "title": "Half-off appetizers",
  "description": "All night, every night.",
  "deal_type": "happy_hour",
  "starts_at": "2026-06-17T00:00:00Z",
  "expires_at": "2026-12-31T23:59:59Z",
  "active": true
}`;

/**
 * Admin-only panel that manually triggers sync-merchant-deals for a specific
 * merchant deal ID. Goes through the admin-sync-merchant-deal wrapper edge
 * function so the webhook secret stays server-side.
 */
export function ManualDealSyncPanel() {
  const [action, setAction] = useState<Action>("update");
  const [dealId, setDealId] = useState("");
  const [dealJson, setDealJson] = useState("");
  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const handleRun = async () => {
    const id = dealId.trim();
    if (!id) {
      toast.error("Enter a merchant deal ID");
      return;
    }

    let extraFields: Record<string, unknown> = {};
    if (action !== "delete" && dealJson.trim()) {
      try {
        const parsed = JSON.parse(dealJson);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          extraFields = parsed as Record<string, unknown>;
        } else {
          toast.error("Deal payload must be a JSON object");
          return;
        }
      } catch {
        toast.error("Deal payload is not valid JSON");
        return;
      }
    }

    setRunning(true);
    setLastResult(null);
    try {
      const payload = {
        action,
        deal: { ...extraFields, id },
      };
      const { data, error } = await supabase.functions.invoke("admin-sync-merchant-deal", {
        body: payload,
      });
      if (error) throw error;

      const result = data as { ok?: boolean; status?: number; result?: unknown } | null;
      setLastResult(JSON.stringify(result?.result ?? result, null, 2));
      if (result?.ok) {
        toast.success(`Sync succeeded (${action})`);
      } else {
        toast.error(`Sync returned status ${result?.status ?? "?"}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to trigger sync";
      toast.error(msg);
      setLastResult(msg);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border/60 bg-card/60 backdrop-blur-xl p-5 sm:p-6 flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-display font-semibold">Manual merchant deal sync</h2>
        <p className="text-sm text-muted-foreground">
          Force-trigger the <code className="text-xs">sync-merchant-deals</code> webhook for a specific deal ID.
          Useful when JET Bridge didn&apos;t fire (or fired with a bad secret) and the deal is missing from the Hot tab.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="flex flex-col gap-2">
          <Label>Action</Label>
          <Select value={action} onValueChange={(v) => setAction(v as Action)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="create">create (upsert)</SelectItem>
              <SelectItem value="update">update</SelectItem>
              <SelectItem value="delete">delete</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="manual-sync-deal-id">Merchant deal ID (UUID)</Label>
          <Input
            id="manual-sync-deal-id"
            value={dealId}
            onChange={(e) => setDealId(e.target.value)}
            placeholder="00000000-0000-0000-0000-000000000000"
          />
        </div>
      </div>

      {action !== "delete" && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="manual-sync-payload">
            Deal payload (JSON) — required fields for create/update
          </Label>
          <Textarea
            id="manual-sync-payload"
            rows={10}
            value={dealJson}
            onChange={(e) => setDealJson(e.target.value)}
            placeholder={PLACEHOLDER_JSON}
            className="font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground">
            Paste the deal record from JET Bridge. The <code>id</code> field above will be merged in automatically.
          </p>
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={handleRun} disabled={running} className="gap-2">
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {running ? "Syncing…" : `Trigger ${action}`}
        </Button>
      </div>

      {lastResult && (
        <div className="flex flex-col gap-2">
          <Label>Response</Label>
          <pre className="rounded-lg bg-muted/40 border border-border/40 p-3 text-xs overflow-auto max-h-64 whitespace-pre-wrap">
            {lastResult}
          </pre>
        </div>
      )}
    </div>
  );
}