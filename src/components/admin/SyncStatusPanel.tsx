import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatDistanceToNow } from "date-fns";
import {
  AlertCircle,
  CheckCircle2,
  Database,
  RefreshCw,
  Tags,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { getAdminUserSyncStatus } from "@/lib/admin-directory.functions";
import { resolveVenueCategory, VENUE_CATEGORIES } from "@/lib/venue-categories";

type DealRow = {
  id: string;
  deal_type: string | null;
  venue_name: string | null;
  active: boolean | null;
  updated_at: string | null;
  created_at: string | null;
};

const ago = (iso: string | null | undefined) =>
  iso ? formatDistanceToNow(new Date(iso), { addSuffix: true }) : "—";

const minutesSince = (iso: string | null | undefined) =>
  iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 60000) : null;

/**
 * Single-glance confirmation that the app's data plane is in sync:
 * auth ↔ profiles ↔ preferences mapping, merchant deal taxonomy coverage,
 * and the freshness of the last sync/update across key tables.
 */
export const SyncStatusPanel = () => {
  const fetchSyncStatus = useServerFn(getAdminUserSyncStatus);

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["admin", "sync-status"],
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const [mapping, dealsRes, pulseRes, analyticsRes] = await Promise.all([
        fetchSyncStatus(),
        supabase
          .from("deals")
          .select("id,deal_type,venue_name,active,updated_at,created_at")
          .order("updated_at", { ascending: false })
          .limit(1000),
        supabase
          .from("map_data_pulse")
          .select("updated_at,point_count")
          .maybeSingle(),
        supabase
          .from("analytics_events")
          .select("created_at")
          .order("created_at", { ascending: false })
          .limit(1),
      ]);

      const deals = (dealsRes.data ?? []) as DealRow[];
      const counts = new Map<string, number>();
      let unmapped = 0;
      for (const d of deals) {
        const raw = d.deal_type ?? "";
        const def = resolveVenueCategory(raw);
        if (!raw.trim()) unmapped += 1;
        counts.set(def.id, (counts.get(def.id) ?? 0) + 1);
      }

      return {
        mapping,
        deals: {
          total: deals.length,
          active: deals.filter((d) => d.active).length,
          lastUpdatedAt: deals[0]?.updated_at ?? null,
          unmapped,
          counts,
        },
        pulse: pulseRes.data as {
          updated_at: string;
          point_count: number;
        } | null,
        lastAnalyticsAt: analyticsRes.data?.[0]?.created_at ?? null,
      };
    },
  });

  const mapping = data?.mapping ?? null;
  const mappingHealthy =
    mapping !== null &&
    mapping.missing_profiles === 0 &&
    mapping.missing_preferences === 0 &&
    mapping.orphan_profiles === 0;

  const dealMinutes = minutesSince(data?.deals.lastUpdatedAt);
  const dealsFresh = dealMinutes !== null && dealMinutes < 60 * 24;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Database className="w-5 h-5 text-primary" />
              Sync Status
            </CardTitle>
            <CardDescription>
              Database mapping, merchant taxonomy coverage, and last update
              times.
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => refetch()}
            aria-label="Refresh sync status"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* DB mapping */}
        <section>
          <div className="flex items-center gap-2 mb-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Account mapping
            </p>
            <Badge
              variant={mappingHealthy ? "secondary" : "destructive"}
              className="gap-1"
            >
              {mappingHealthy ? (
                <CheckCircle2 className="w-3 h-3" />
              ) : (
                <AlertCircle className="w-3 h-3" />
              )}
              {mappingHealthy ? "In sync" : "Drift detected"}
            </Badge>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {[
              ["Auth users", mapping?.auth_users],
              ["Profiles", mapping?.profiles],
              ["Preferences", mapping?.preferences],
              ["Missing profiles", mapping?.missing_profiles],
              ["Missing preferences", mapping?.missing_preferences],
              ["Orphan profiles", mapping?.orphan_profiles],
            ].map(([label, value]) => (
              <div
                key={label as string}
                className="rounded-md border border-border/60 px-3 py-2"
              >
                <div className="text-xs text-muted-foreground">{label}</div>
                <div className="text-lg font-semibold tabular-nums">
                  {value ?? "—"}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Taxonomy sync */}
        <section>
          <div className="flex items-center gap-2 mb-2">
            <Tags className="w-4 h-4 text-muted-foreground" />
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Taxonomy sync
            </p>
            <Badge variant={data?.deals.unmapped ? "destructive" : "secondary"}>
              {data?.deals.unmapped ?? 0} untyped
            </Badge>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {VENUE_CATEGORIES.map((def) => {
              const count = data?.deals.counts.get(def.id) ?? 0;
              return (
                <Badge
                  key={def.id}
                  variant={count ? "default" : "outline"}
                  className="text-[10px]"
                >
                  {def.label} · {count}
                </Badge>
              );
            })}
          </div>
        </section>

        {/* Freshness */}
        <section>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Last update
          </p>
          <ul className="text-sm divide-y divide-border/60 rounded-md border border-border/60">
            <li className="flex items-center justify-between px-3 py-2">
              <span>
                Merchant deals ({data?.deals.active ?? 0} live /{" "}
                {data?.deals.total ?? 0})
              </span>
              <span
                className={
                  dealsFresh ? "text-muted-foreground" : "text-destructive"
                }
              >
                {ago(data?.deals.lastUpdatedAt)}
              </span>
            </li>
            <li className="flex items-center justify-between px-3 py-2">
              <span>Map data pulse ({data?.pulse?.point_count ?? 0} pts)</span>
              <span className="text-muted-foreground">
                {ago(data?.pulse?.updated_at)}
              </span>
            </li>
            <li className="flex items-center justify-between px-3 py-2">
              <span>Analytics events</span>
              <span className="text-muted-foreground">
                {ago(data?.lastAnalyticsAt)}
              </span>
            </li>
          </ul>
        </section>
      </CardContent>
    </Card>
  );
};

export default SyncStatusPanel;
