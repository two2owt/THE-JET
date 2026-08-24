import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { QrCode, RefreshCw, TicketCheck } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import {
  getRedemptionAnalytics,
  type RedemptionAnalytics,
} from "@/lib/redemptions.functions";

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function RedemptionsPanel() {
  const fetchAnalytics = useServerFn(getRedemptionAnalytics);
  const [data, setData] = useState<RedemptionAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await fetchAnalytics({ data: undefined }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [fetchAnalytics]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <Skeleton className="h-72 w-full rounded-2xl" />;

  const maxDaily = Math.max(1, ...(data?.daily.map((d) => d.redeemed) ?? [1]));

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <TicketCheck className="h-4 w-4 text-primary" />
            Redemptions
          </CardTitle>
          <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" asChild>
            <Link to="/redeem">
              <QrCode className="mr-2 h-4 w-4" />
              Open scanner
            </Link>
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setLoading(true);
              void load();
            }}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Codes issued", value: data?.totals.issued ?? 0 },
              { label: "Redeemed", value: data?.totals.redeemed ?? 0 },
              { label: "Today", value: data?.totals.redeemedToday ?? 0 },
              {
                label: "Redemption rate",
                value: pct(data?.totals.redemptionRate ?? 0),
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl border border-border bg-card/60 p-3"
              >
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                <p className="font-display text-2xl">{stat.value}</p>
              </div>
            ))}
          </div>

          <div>
            <p className="mb-2 text-xs text-muted-foreground">
              Last 14 days ({data?.totals.redeemedInactive ?? 0} on inactive
              deals)
            </p>
            <div className="flex h-24 items-end gap-1">
              {data?.daily.map((d) => (
                <div
                  key={d.date}
                  className="flex-1 rounded-t bg-primary/70"
                  style={{
                    height: `${Math.max(4, (d.redeemed / maxDaily) * 100)}%`,
                  }}
                  title={`${d.date}: ${d.redeemed}`}
                />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Top deals</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {(data?.byDeal.length ?? 0) === 0 && (
            <p className="text-sm text-muted-foreground">
              No redemption codes issued yet.
            </p>
          )}
          {data?.byDeal.map((d) => (
            <div
              key={d.deal_id}
              className="flex items-center justify-between gap-3 border-b border-border/50 pb-2 last:border-0"
            >
              <div className="min-w-0">
                <p className="truncate text-sm">{d.deal_title ?? d.deal_id}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {d.venue_name ?? "—"}
                  {d.lastRedeemedAt
                    ? ` · last ${formatDistanceToNow(new Date(d.lastRedeemedAt), { addSuffix: true })}`
                    : ""}
                </p>
              </div>
              <Badge variant="outline" className="shrink-0">
                {d.redeemed}/{d.issued}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <QrCode className="h-4 w-4" />
            Recent codes
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {data?.recent.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between gap-2 text-xs"
            >
              <span className="font-mono">{r.code}</span>
              <span className="truncate text-muted-foreground">
                {r.deal_title ?? "—"}
              </span>
              <Badge
                variant={r.status === "redeemed" ? "default" : "secondary"}
                className="shrink-0"
              >
                {r.status}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export default RedemptionsPanel;
