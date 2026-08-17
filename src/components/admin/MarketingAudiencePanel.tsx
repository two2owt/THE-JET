import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Megaphone, RefreshCw, ExternalLink } from "lucide-react";
import { toast } from "sonner";

type SyncLogRow = {
  id: string;
  audience_id: string;
  synced_count: number;
  removed_count: number;
  failed_count: number;
  created_at: string;
};

/**
 * Pushes marketing-consented users into the Resend audience used for
 * newsletters. Campaigns themselves are composed and sent from Resend
 * Broadcasts — JET only owns consent and the contact list.
 */
export const MarketingAudiencePanel = () => {
  const [syncing, setSyncing] = useState(false);

  const { data: optedIn, isLoading: loadingCount, refetch: refetchCount } = useQuery({
    queryKey: ["admin", "marketing-optin-count"],
    staleTime: 30_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("user_preferences")
        .select("user_id", { count: "exact", head: true })
        .eq("marketing_emails_enabled", true);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const { data: history, refetch: refetchHistory } = useQuery({
    queryKey: ["admin", "marketing-sync-log"],
    staleTime: 30_000,
    queryFn: async (): Promise<SyncLogRow[]> => {
      const { data, error } = await supabase
        .from("marketing_audience_sync_log")
        .select("id, audience_id, synced_count, removed_count, failed_count, created_at")
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data ?? []) as SyncLogRow[];
    },
  });

  const runSync = async () => {
    setSyncing(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("You need to be signed in as an admin");

      const res = await fetch("/api/public/hooks/sync-resend-audience", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: "{}",
      });
      const payload = (await res.json()) as {
        error?: string;
        eligible?: number;
        synced?: number;
        unsubscribed?: number;
        failures?: string[];
      };
      if (!res.ok) throw new Error(payload.error ?? `Sync failed (${res.status})`);

      toast.success(
        `Audience synced — ${payload.synced ?? 0} contacts up to date, ${payload.unsubscribed ?? 0} opted out`,
      );
      if (payload.failures?.length) {
        toast.error(`${payload.failures.length} contact(s) failed: ${payload.failures[0]}`);
      }
      refetchCount();
      refetchHistory();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const last = history?.[0];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Megaphone className="w-4 h-4 text-gold" />
          Newsletter audience
        </CardTitle>
        <CardDescription>
          Syncs everyone who opted into the JET newsletter into your Resend audience. Write
          and send the campaign from Resend Broadcasts — opt-outs and bounces flow back here
          automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">
            {loadingCount ? "…" : optedIn} opted in
          </Badge>
          {last && (
            <Badge variant="outline">
              Last sync {new Date(last.created_at).toLocaleString()} · {last.synced_count} synced ·{" "}
              {last.removed_count} removed
              {last.failed_count ? ` · ${last.failed_count} failed` : ""}
            </Badge>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={runSync} disabled={syncing}>
            {syncing ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Sync audience to Resend
          </Button>
          <Button variant="outline" asChild>
            <a href="https://resend.com/broadcasts" target="_blank" rel="noreferrer">
              <ExternalLink className="w-4 h-4 mr-2" />
              Open Resend Broadcasts
            </a>
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Only email-verified users who turned on “JET Newsletter” in settings are included.
          Suppressed, bounced and unsubscribed addresses are marked unsubscribed in Resend and
          never re-added.
        </p>
      </CardContent>
    </Card>
  );
};