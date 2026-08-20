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
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import {
  getPushDiagnostics,
  type PushDiagnostics,
} from "@/lib/push-diagnostics.functions";

const ago = (iso: string | null) =>
  iso ? `${formatDistanceToNow(new Date(iso))} ago` : "never";

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
