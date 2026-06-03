import { useEffect, useState } from "react";
import { ExternalLink, Store, Sparkles, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { OnboardingStatusBadge } from "./OnboardingStatusBadge";

const MERCHANT_PORTAL_URL = "https://www.jetbridge.partners";
const MERCHANT_SIGNUP_URL = "https://www.jetlanding.app";

type SyncedDeal = {
  id: string;
  title: string;
  venue_name: string;
  deal_type: string;
  active: boolean;
  created_at: string;
  updated_at: string;
  merchant_id: string | null;
  onboarding_started_at: string | null;
  onboarding_completed_at: string | null;
};

export function JetBridgeShortcut() {
  const [recentDeals, setRecentDeals] = useState<SyncedDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("deals")
      .select("id,title,venue_name,deal_type,active,created_at,updated_at,merchant_id,onboarding_started_at,onboarding_completed_at")
      .order("updated_at", { ascending: false })
      .limit(5);
    if (!error && data) {
      setRecentDeals(data as SyncedDeal[]);
      setLastSyncAt(data[0]?.updated_at ?? null);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel("admin-jetbridge-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "deals" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const open = (url: string) => window.open(url, "_blank", "noopener,noreferrer");

  const minutesSinceSync = lastSyncAt
    ? Math.floor((Date.now() - new Date(lastSyncAt).getTime()) / 60000)
    : null;
  const healthy = minutesSinceSync !== null && minutesSinceSync < 60 * 24;

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-card to-card/60">
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Store className="w-5 h-5 text-primary" />
              JET Bridge — Merchant Portal
            </CardTitle>
            <CardDescription>
              Self-serve merchant onboarding & deal management. Deals listed below are synced live via webhook.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {lastSyncAt && (
              <Badge variant={healthy ? "secondary" : "destructive"} className="gap-1">
                {healthy ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                Last sync {formatDistanceToNow(new Date(lastSyncAt), { addSuffix: true })}
              </Badge>
            )}
            <Button variant="ghost" size="icon" onClick={load} aria-label="Refresh sync status">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => open(MERCHANT_PORTAL_URL)} className="gap-2">
            <Store className="w-4 h-4" />
            Open Merchant Portal
            <ExternalLink className="w-3.5 h-3.5 opacity-70" />
          </Button>
          <Button variant="outline" onClick={() => open(MERCHANT_SIGNUP_URL)} className="gap-2">
            <Sparkles className="w-4 h-4" />
            Onboarding Landing
            <ExternalLink className="w-3.5 h-3.5 opacity-70" />
          </Button>
        </div>

        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Recently synced deals
          </p>
          {loading && recentDeals.length === 0 ? (
            <div className="text-sm text-muted-foreground py-3">Loading…</div>
          ) : recentDeals.length === 0 ? (
            <div className="text-sm text-muted-foreground py-3">
              No deals synced yet. Merchants can publish from the portal above.
            </div>
          ) : (
            <ul className="divide-y divide-border/60 rounded-md border border-border/60">
              {recentDeals.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{d.title}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {d.venue_name} · {d.deal_type}
                    </div>
                    <div className="mt-1">
                      <OnboardingStatusBadge
                        startedAt={d.onboarding_started_at}
                        completedAt={d.onboarding_completed_at}
                        merchantId={d.merchant_id}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={d.active ? "default" : "outline"} className="text-[10px]">
                      {d.active ? "Live" : "Paused"}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(d.updated_at), { addSuffix: true })}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default JetBridgeShortcut;