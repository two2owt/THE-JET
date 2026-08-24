import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Bell, MapPin, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ANALYTICS_EVENTS } from "@/lib/analyticsEvents";

const EVENTS = [
  ANALYTICS_EVENTS.PERMISSION_PROMPT_SHOWN,
  ANALYTICS_EVENTS.PERMISSION_PROMPT_ACCEPTED,
  ANALYTICS_EVENTS.PERMISSION_PROMPT_DENIED,
  ANALYTICS_EVENTS.PERMISSION_PROMPT_SNOOZED,
] as const;

const ROUTES = ["/", "/deals", "other"] as const;
type RouteKey = (typeof ROUTES)[number];
type PermissionKey = "location" | "push";

interface Cell {
  shown: number;
  accepted: number;
  denied: number;
  snoozed: number;
  snoozeTotal: number;
}

const emptyCell = (): Cell => ({
  shown: 0,
  accepted: 0,
  denied: 0,
  snoozed: 0,
  snoozeTotal: 0,
});

type Matrix = Record<PermissionKey, Record<RouteKey, Cell>>;

const emptyMatrix = (): Matrix => ({
  location: { "/": emptyCell(), "/deals": emptyCell(), other: emptyCell() },
  push: { "/": emptyCell(), "/deals": emptyCell(), other: emptyCell() },
});

const WINDOWS = [
  { label: "24h", days: 1 },
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
];

/**
 * Admin-only view of permission priming performance: impressions, accept /
 * deny outcomes and snooze volume, split by the route the ask fired on
 * (`/` = map, `/deals` = deals tab).
 */
export function PermissionPromptPanel() {
  const [days, setDays] = useState(7);
  const [matrix, setMatrix] = useState<Matrix>(emptyMatrix());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const since = new Date(Date.now() - days * 86400000).toISOString();
    try {
      const client = supabase as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            in: (
              col: string,
              vals: readonly string[],
            ) => {
              gte: (
                col: string,
                v: string,
              ) => Promise<{
                data: Array<{
                  event_name: string;
                  event_data: Record<string, unknown> | null;
                  page_path: string | null;
                }> | null;
                error: { message: string } | null;
              }>;
            };
          };
        };
      };

      const { data, error: qErr } = await client
        .from("analytics_events")
        .select("event_name, event_data, page_path")
        .in("event_name", EVENTS)
        .gte("created_at", since);
      if (qErr) throw new Error(qErr.message);

      const next = emptyMatrix();
      for (const row of data ?? []) {
        const d = row.event_data ?? {};
        const permission =
          d.permission === "push" || d.permission === "location"
            ? (d.permission as PermissionKey)
            : null;
        if (!permission) continue;
        const rawRoute = (d.route as string) ?? row.page_path ?? "other";
        const route: RouteKey = ROUTES.includes(rawRoute as RouteKey)
          ? (rawRoute as RouteKey)
          : "other";
        const cell = next[permission][route];
        if (row.event_name === ANALYTICS_EVENTS.PERMISSION_PROMPT_SHOWN)
          cell.shown += 1;
        else if (row.event_name === ANALYTICS_EVENTS.PERMISSION_PROMPT_ACCEPTED)
          cell.accepted += 1;
        else if (row.event_name === ANALYTICS_EVENTS.PERMISSION_PROMPT_DENIED)
          cell.denied += 1;
        else if (
          row.event_name === ANALYTICS_EVENTS.PERMISSION_PROMPT_SNOOZED
        ) {
          cell.snoozed += 1;
          const n = Number(d.snooze_count);
          if (Number.isFinite(n)) cell.snoozeTotal = Math.max(cell.snoozeTotal, n);
        }
      }
      setMatrix(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load prompt metrics");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  const renderRow = (permission: PermissionKey, route: RouteKey) => {
    const c = matrix[permission][route];
    const rate = c.shown > 0 ? Math.round((c.accepted / c.shown) * 100) : null;
    return (
      <tr key={`${permission}-${route}`} className="border-t border-border/40">
        <td className="py-2 pr-3 text-sm">
          {route === "/" ? "Map (/)" : route === "/deals" ? "Deals (/deals)" : "Other"}
        </td>
        <td className="py-2 pr-3 text-sm tabular-nums">{c.shown}</td>
        <td className="py-2 pr-3 text-sm tabular-nums text-emerald-400">
          {c.accepted}
        </td>
        <td className="py-2 pr-3 text-sm tabular-nums text-destructive">
          {c.denied}
        </td>
        <td className="py-2 pr-3 text-sm tabular-nums">{c.snoozed}</td>
        <td className="py-2 text-sm tabular-nums">
          {rate === null ? "—" : `${rate}%`}
        </td>
      </tr>
    );
  };

  const renderTable = (permission: PermissionKey) => (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {permission === "location" ? (
          <MapPin className="h-4 w-4 text-primary" />
        ) : (
          <Bell className="h-4 w-4 text-primary" />
        )}
        <span className="text-sm font-medium">
          {permission === "location" ? "Location permission" : "Push permission"}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th className="py-1 pr-3 font-normal">Route</th>
              <th className="py-1 pr-3 font-normal">Impressions</th>
              <th className="py-1 pr-3 font-normal">Accepted</th>
              <th className="py-1 pr-3 font-normal">Denied</th>
              <th className="py-1 pr-3 font-normal">Snoozes</th>
              <th className="py-1 font-normal">Accept rate</th>
            </tr>
          </thead>
          <tbody>{ROUTES.map((r) => renderRow(permission, r))}</tbody>
        </table>
      </div>
    </div>
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base">Permission prompt performance</CardTitle>
        <div className="flex items-center gap-2">
          {WINDOWS.map((w) => (
            <Badge
              key={w.label}
              variant={days === w.days ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => setDays(w.days)}
            >
              {w.label}
            </Badge>
          ))}
          <Button size="sm" variant="ghost" onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {loading ? (
          <>
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </>
        ) : (
          <>
            {renderTable("location")}
            {renderTable("push")}
          </>
        )}
      </CardContent>
    </Card>
  );
}
