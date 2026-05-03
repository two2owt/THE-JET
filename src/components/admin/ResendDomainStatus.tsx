import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, CheckCircle2, AlertTriangle, MailWarning } from "lucide-react";

interface ResendDomain {
  name: string;
  status: string;
  region?: string;
  created_at?: string;
}

interface DomainStatusResponse {
  from: string;
  fromDomain: string | null;
  isFromVerified: boolean;
  matchedDomainStatus: string | null;
  domains: ResendDomain[];
}

export function ResendDomainStatus() {
  const [data, setData] = useState<DomainStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: res, error: invokeErr } = await supabase.functions.invoke(
        "list-resend-domains"
      );
      if (invokeErr) throw invokeErr;
      if ((res as any)?.error) throw new Error((res as any).error);
      setData(res as DomainStatusResponse);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const statusVariant = (status: string) => {
    if (status === "verified") return "default" as const;
    if (status === "pending" || status === "not_started") return "secondary" as const;
    return "destructive" as const;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <MailWarning className="w-5 h-5 text-primary" />
          Resend Sender Domains
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Checking Resend…
          </div>
        )}
        {error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {data && (
          <>
            <div className="rounded-md border border-border bg-muted/30 p-3 space-y-1.5">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Active sender (RESEND_FROM_EMAIL)
              </div>
              <div className="font-mono text-sm break-all">{data.from}</div>
              <div className="flex items-center gap-2 pt-1">
                {data.isFromVerified ? (
                  <Badge className="gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Verified
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    {data.matchedDomainStatus
                      ? `Domain status: ${data.matchedDomainStatus}`
                      : "Domain not found in Resend"}
                  </Badge>
                )}
              </div>
              {!data.isFromVerified && (
                <p className="text-xs text-muted-foreground pt-1">
                  Emails from this address may fail to deliver. Update the
                  RESEND_FROM_EMAIL secret to a verified domain below.
                </p>
              )}
            </div>

            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                All Resend domains
              </div>
              {data.domains.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No domains configured in Resend.
                </p>
              ) : (
                <ul className="divide-y divide-border rounded-md border border-border">
                  {data.domains.map((d) => (
                    <li
                      key={d.name}
                      className="flex items-center justify-between gap-3 p-3"
                    >
                      <div className="min-w-0">
                        <div className="font-mono text-sm truncate">{d.name}</div>
                        {d.region && (
                          <div className="text-xs text-muted-foreground">
                            Region: {d.region}
                          </div>
                        )}
                      </div>
                      <Badge variant={statusVariant(d.status)}>{d.status}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
