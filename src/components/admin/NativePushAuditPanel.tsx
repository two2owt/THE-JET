import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, RefreshCw, Smartphone } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import {
  getNativePushAudit,
  type NativePushAudit,
  type NativePushAuditStatus,
} from "@/lib/native-push-audit.functions";

const ago = (iso: string | null) =>
  iso ? `${formatDistanceToNow(new Date(iso))} ago` : "never";

const FILTERS: NativePushAuditStatus[] = [
  "all",
  "failed",
  "unregistered",
  "sent",
];

const statusVariant = (status: string) =>
  status === "sent"
    ? "secondary"
    : status === "unregistered"
      ? "outline"
      : "destructive";

/**
 * Per-attempt audit of native (iOS/Android) push sends: which device token was
 * targeted, on what platform, whether FCM accepted it, and the exact error when
 * it didn't.
 */
export function NativePushAuditPanel() {
  const fetchAudit = useServerFn(getNativePushAudit);
  const [data, setData] = useState<NativePushAudit | null>(null);
  const [status, setStatus] = useState<NativePushAuditStatus>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (next: NativePushAuditStatus) => {
      setError(null);
      try {
        setData(await fetchAudit({ data: { status: next } }));
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Could not load the push audit",
        );
      } finally {
        setLoading(false);
      }
    },
    [fetchAudit],
  );

  useEffect(() => {
    void load(status);
  }, [load, status]);

  const totals = data?.totals;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Smartphone className="h-4 w-4" />
          Native push audit
        </CardTitle>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setLoading(true);
            void load(status);
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
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Button
              key={f}
              size="sm"
              variant={status === f ? "default" : "outline"}
              onClick={() => {
                setLoading(true);
                setStatus(f);
              }}
              className="capitalize"
            >
              {f}
            </Button>
          ))}
        </div>

        {loading && !data ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : error ? (
          <p className="flex items-center gap-2 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </p>
        ) : !data ? null : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {[
                ["Attempts", totals!.attempts],
                ["Delivered", totals!.sent],
                ["Failed", totals!.failed],
                ["Unregistered", totals!.unregistered],
                ["Skipped", totals!.skipped],
              ].map(([label, value]) => (
                <div
                  key={label as string}
                  className="rounded-lg border border-border/60 bg-card/40 p-3"
                >
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="font-display text-xl">{value as number}</p>
                </div>
              ))}
            </div>

            <p className="text-xs text-muted-foreground">
              Last {Math.round(data.window.hours / 24)} days ·{" "}
              {data.window.sampled} attempt
              {data.window.sampled === 1 ? "" : "s"} sampled · generated{" "}
              {ago(data.generatedAt)}
            </p>

            {data.byPlatform.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {data.byPlatform.map((p) => (
                  <Badge key={p.platform} variant="outline">
                    {p.platform}: {p.sent}/{p.attempts} delivered
                  </Badge>
                ))}
              </div>
            )}

            <section className="space-y-2">
              <h4 className="text-sm font-medium">Devices</h4>
              {data.devices.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No native send attempts recorded in this window.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="text-muted-foreground">
                      <tr>
                        <th className="py-1 pr-3 font-normal">Token</th>
                        <th className="py-1 pr-3 font-normal">Platform</th>
                        <th className="py-1 pr-3 font-normal">Sent</th>
                        <th className="py-1 pr-3 font-normal">Failed</th>
                        <th className="py-1 pr-3 font-normal">Last attempt</th>
                        <th className="py-1 font-normal">Last error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.devices.map((d) => (
                        <tr
                          key={`${d.subscriptionId ?? d.tokenTail}`}
                          className="border-t border-border/40 align-top"
                        >
                          <td className="py-1.5 pr-3 font-mono">
                            {d.tokenTail ?? "—"}
                          </td>
                          <td className="py-1.5 pr-3">{d.platform}</td>
                          <td className="py-1.5 pr-3">{d.sent}</td>
                          <td className="py-1.5 pr-3">
                            {d.failed + d.unregistered}
                          </td>
                          <td className="py-1.5 pr-3 whitespace-nowrap">
                            {ago(d.lastAttemptAt)}
                          </td>
                          <td className="max-w-[22rem] py-1.5 text-muted-foreground">
                            {d.lastError ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="space-y-2">
              <h4 className="text-sm font-medium">Recent attempts</h4>
              {data.attempts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nothing to show for this filter.
                </p>
              ) : (
                <ul className="space-y-2">
                  {data.attempts.slice(0, 25).map((a) => (
                    <li
                      key={a.id}
                      className="rounded-lg border border-border/60 bg-card/40 p-3 text-xs"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={statusVariant(a.status)}>
                          {a.status}
                        </Badge>
                        <span className="font-mono">{a.tokenTail ?? "—"}</span>
                        <span className="text-muted-foreground">
                          {a.platform}
                        </span>
                        {a.httpStatus ? (
                          <span className="text-muted-foreground">
                            HTTP {a.httpStatus}
                          </span>
                        ) : null}
                        {a.eventType ? (
                          <span className="text-muted-foreground">
                            {a.eventType}
                          </span>
                        ) : null}
                        <span className="ml-auto text-muted-foreground">
                          {ago(a.attemptedAt)}
                        </span>
                      </div>
                      {a.error ? (
                        <p className="mt-1.5 break-words text-destructive">
                          {a.error}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </CardContent>
    </Card>
  );
}
