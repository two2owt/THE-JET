import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, UserCog, Play, Eye } from "lucide-react";
import { toast } from "sonner";

type BackfillResult = {
  auto_handles_assigned: number;
  claimed_flags_set: number;
  dry_run: boolean;
};

/**
 * One-off maintenance action replacing the old display-name backfill that used
 * to run inside a migration. Keeping data mutations out of migrations avoids
 * the "conflicts with live data" publish gate.
 */
export const DisplayNameBackfillPanel = () => {
  const [busy, setBusy] = useState<"preview" | "apply" | null>(null);
  const [result, setResult] = useState<BackfillResult | null>(null);

  const run = async (dryRun: boolean) => {
    setBusy(dryRun ? "preview" : "apply");
    try {
      const { data, error } = await supabase.rpc(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "admin_backfill_display_names" as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { _dry_run: dryRun } as any,
      );
      if (error) throw error;
      const row = (Array.isArray(data) ? data[0] : data) as BackfillResult;
      setResult(row ?? null);
      const total =
        (row?.auto_handles_assigned ?? 0) + (row?.claimed_flags_set ?? 0);
      toast.success(
        dryRun
          ? `${total} profile${total === 1 ? "" : "s"} would be updated`
          : `${total} profile${total === 1 ? "" : "s"} updated`,
      );
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Could not run the display-name backfill",
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <UserCog className="h-4 w-4 text-primary" />
          Display-name backfill
        </CardTitle>
        <CardDescription>
          Assigns auto handles to profiles with a missing or email-looking name,
          and marks genuinely chosen names as claimed. Preview first, then apply.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={busy !== null}
            onClick={() => run(true)}
          >
            {busy === "preview" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Eye className="mr-2 h-4 w-4" />
            )}
            Preview
          </Button>
          <Button size="sm" disabled={busy !== null} onClick={() => run(false)}>
            {busy === "apply" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            Run backfill
          </Button>
        </div>
        {result && (
          <p className="text-sm text-muted-foreground">
            {result.dry_run ? "Would assign" : "Assigned"}{" "}
            <span className="font-medium text-foreground">
              {result.auto_handles_assigned}
            </span>{" "}
            auto handle(s) · {result.dry_run ? "would mark" : "marked"}{" "}
            <span className="font-medium text-foreground">
              {result.claimed_flags_set}
            </span>{" "}
            name(s) as claimed.
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default DisplayNameBackfillPanel;