import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle,
  BellRing,
  Globe,
  RefreshCw,
  Smartphone,
  Users,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import {
  getPushDiagnostics,
  type PushDiagnostics,
} from "@/lib/push-diagnostics.functions";

const ago = (iso: string | null) =>
  iso ? `${formatDistanceToNow(new Date(iso))} ago` : "never";

function CoverageStat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "warn";
}) {
  return (
    <div className="rounded-lg border border-border/60 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`font-display text-2xl ${tone === "warn" ? "text-destructive" : ""}`}
      >
        {value}
      </p>
      {hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/** Admin view of push reach, last successful sends and recent failures. */
export function PushDiagnosticsPanel() {
  const fetchDiagnostics = useServerFn(getPushDiagnostics);
  const [data, setData] = useState<PushDiagnostics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await fetchDiagnostics());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load diagnostics");
    } finally {
      setLoading(false);
    }
  }, [fetchDiagnostics]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <BellRing className="h-4 w-4" />
          Push diagnostics
        </CardTitle>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setLoading(true);
            void load();
          }}
          disabled={loading}
        >
          <RefreshCw
            className={`mr-2 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </CardHeader>

      <CardContent className="space-y-5">
        {loading && !data ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : data ? (
          <>
            <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <Users className="h-3.5 w-3.5" /> Push coverage
                </p>
                <Badge variant="secondary">
                  {data.coverage.reachRate}% of eligible users reachable
                </Badge>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <CoverageStat
                  label="Eligible users"
                  value={data.coverage.eligibleUsers}
                  hint={`${data.coverage.totalUsers} signed up · ${data.coverage.optedOutUsers} opted out`}
                />
                <CoverageStat
                  label="With a registered device"
                  value={data.coverage.usersWithDevice}
                  hint={`${data.coverage.usersWebOnly} web · ${data.coverage.usersNativeOnly} native · ${data.coverage.usersBothChannels} both`}
                />
                <CoverageStat
                  label="Eligible, no device yet"
                  value={data.coverage.eligibleWithoutDevice}
                  tone={data.coverage.eligibleWithoutDevice > 0 ? "warn" : undefined}
                  hint={`${data.coverage.usersInactiveOnly} have only revoked tokens`}
                />
                <CoverageStat
                  label={`Delivered (last ${data.window.hours}h)`}
                  value={data.coverage.deliveredUsers}
                  hint={`${data.coverage.deliveryRate}% of reachable · ${data.coverage.failedUsers} users with failures`}
                />
              </div>

              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-500"
                  style={{
                    width: `${Math.min(100, data.coverage.reachRate)}%`,
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {data.coverage.optedOutWithDevice > 0
                  ? `${data.coverage.optedOutWithDevice} opted-out user(s) still have a live token and are excluded from sends.`
                  : "No opted-out users are holding live tokens."}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-border/60 p-3">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Globe className="h-3.5 w-3.5" /> Active web subscriptions
                </p>
                <p className="font-display text-2xl">{data.totals.web}</p>
                <p className="text-xs text-muted-foreground">
                  Last send {ago(data.lastSuccess.web)}
                </p>
              </div>
              <div className="rounded-lg border border-border/60 p-3">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Smartphone className="h-3.5 w-3.5" /> Native device tokens
                </p>
                <p className="font-display text-2xl">{data.totals.native}</p>
                <p className="text-xs text-muted-foreground">
                  Last send {ago(data.lastSuccess.native)}
                </p>
              </div>
              <div className="rounded-lg border border-border/60 p-3">
                <p className="text-xs text-muted-foreground">
                  Inactive / revoked
                </p>
                <p className="font-display text-2xl">{data.totals.inactive}</p>
                <p className="text-xs text-muted-foreground">
                  {data.window.sampled} deliveries in last {data.window.hours}h
                </p>
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Registrations by platform
              </p>
              <div className="flex flex-wrap gap-2">
                {data.subscriptions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No subscriptions registered yet.
                  </p>
                ) : (
                  data.subscriptions.map((s) => (
                    <div
                      key={s.platform}
                      className="rounded-md border border-border/60 px-3 py-2 text-xs"
                    >
                      <span className="font-medium">{s.platform}</span>{" "}
                      <Badge variant="secondary">{s.channel}</Badge>
                      <p className="mt-1 text-muted-foreground">
                        {s.active} active · {s.inactive} inactive · updated{" "}
                        {ago(s.lastRegisteredAt)}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Delivery by audience (last {data.window.hours}h)
              </p>
              {data.audiences.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No deliveries in this window.
                </p>
              ) : (
                <div className="space-y-2">
                  {data.audiences.map((a) => (
                    <div
                      key={a.audience}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 px-3 py-2 text-xs"
                    >
                      <span className="font-medium">{a.audience}</span>
                      <span className="text-muted-foreground">
                        {a.sent} sent · {a.opened} opened ·{" "}
                        <span className={a.failed > 0 ? "text-destructive" : ""}>
                          {a.failed} failed
                        </span>
                      </span>
                      <span className="text-muted-foreground">
                        last ok {ago(a.lastSuccessAt)}
                        {a.lastFailureAt
                          ? ` · last fail ${ago(a.lastFailureAt)}`
                          : ""}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <AlertTriangle className="h-3.5 w-3.5" /> Recent delivery errors
              </p>
              {data.errors.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No delivery failures recorded.
                </p>
              ) : (
                <ul className="space-y-2">
                  {data.errors.map((e) => (
                    <li
                      key={e.id}
                      className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs"
                    >
                      <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
                        <Badge variant="outline">{e.channel}</Badge>
                        <span>{e.audience}</span>
                        <span>· {e.category}</span>
                        <span>· {ago(e.createdAt)}</span>
                      </div>
                      <p className="mt-1 break-words text-destructive">
                        {e.error}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
