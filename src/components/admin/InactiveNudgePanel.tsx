import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAdminUserDirectory } from "@/lib/admin-directory.functions";
import { supabase } from "@/integrations/supabase/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, UserRoundX, Send } from "lucide-react";
import { toast } from "sonner";

type DirectoryRow = {
  id: string;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  display_name: string | null;
};

type NudgeResult = { email: string; status: string; error?: string };

const SITE_NAME = "JET";
const ACTIVATION_REDIRECT = "https://jet-around.com/";

const daysAgo = (iso: string) =>
  Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));

/** Branded one-to-one activation email. Sent per recipient, never as a blast. */
const ACTIVATION_SUBJECT = "Your {{site_name}} account is ready — sign in";
const ACTIVATION_HTML = `<div style="font-family:Arial,Helvetica,sans-serif;background:#ffffff;padding:32px 24px;color:#111111">
  <h1 style="font-size:22px;margin:0 0 12px">Your {{site_name}} account is ready, {{display_name}}</h1>
  <p style="font-size:15px;line-height:1.6;color:#55575d;margin:0 0 20px">
    We created an account for {{email}} but you haven't signed in yet. Tap below to
    open {{site_name}} and see the live deals and events happening near you right now.
  </p>
  <a href="{{invite_url}}"
     style="display:inline-block;background:#C9A961;color:#0A0A0A;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:10px">
    Sign in to {{site_name}}
  </a>
  <p style="font-size:12px;color:#8a8d93;margin:24px 0 0">
    If the button doesn't work, copy this link into your browser:<br />{{invite_url}}
  </p>
  <p style="font-size:12px;color:#8a8d93;margin:12px 0 0">
    This sign-in link is single-use and expires shortly.
  </p>
</div>`;

/**
 * Accounts that exist and are email-confirmed but have never signed in
 * (the "Last sign-in: N/A" rows in the user directory).
 *
 * Each row gets its own send button: one trigger, one recipient, one
 * account-activation email. There is deliberately no "send to everyone"
 * action — a blast to this list would be a re-engagement campaign, which
 * belongs in the newsletter audience, not the app email pipeline.
 */
export const InactiveNudgePanel = () => {
  const [busy, setBusy] = useState<string | null>(null);
  const [sent, setSent] = useState<Record<string, number>>({});
  const [runAll, setRunAll] = useState<{ done: number; total: number } | null>(
    null,
  );

  const fetchDirectory = useServerFn(getAdminUserDirectory);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin", "never-signed-in-accounts"],
    staleTime: 30_000,
    queryFn: async (): Promise<DirectoryRow[]> => {
      const rows = (await fetchDirectory()) as DirectoryRow[];
      return (rows ?? [])
        .filter((u) => !u.last_sign_in_at && !!u.email_confirmed_at && !!u.email)
        .sort((a, b) => a.created_at.localeCompare(b.created_at));
    },
  });

  const dormant = data ?? [];

  const sendActivation = async (row: DirectoryRow) => {
    const email = row.email;
    if (!email) return;
    setBusy(email);
    try {
      const { data: res, error } = await supabase.functions.invoke(
        "admin-bulk-provision-users",
        {
          body: {
            // One recipient per invocation — no list looping.
            users: [
              {
                email,
                display_name: row.display_name ?? undefined,
                method: "resend",
              },
            ],
            inviteTemplate: {
              subject: ACTIVATION_SUBJECT.replace("{{site_name}}", SITE_NAME),
              html: ACTIVATION_HTML,
              redirectTo: ACTIVATION_REDIRECT,
            },
          },
        },
      );
      if (error) throw error;
      const results = (res?.results ?? []) as NudgeResult[];
      const failure = results.find((r) => r.status === "error");
      if (failure) throw new Error(failure.error ?? "Send failed");
      toast.success(`Activation email sent to ${email}`);
      setSent((prev) => ({ ...prev, [email]: Date.now() }));
      refetch();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Could not send the activation email",
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <UserRoundX className="h-4 w-4 text-gold" />
              Never signed in
            </CardTitle>
            <CardDescription>
              Confirmed accounts with no sign-in yet — send each one a personal
              activation email with a sign-in link
            </CardDescription>
          </div>
          <Badge variant="secondary">{dormant.length} account(s)</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading accounts…
          </div>
        ) : dormant.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Every confirmed account has signed in at least once.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {dormant.map((u) => (
              <li
                key={u.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/50 p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{u.email}</p>
                  <p className="text-xs text-muted-foreground">
                    Created {daysAgo(u.created_at)}d ago · never signed in
                    {u.display_name ? ` · ${u.display_name}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {sent[u.email!] ? (
                    <Badge
                      variant="outline"
                      className="border-emerald-500/40 text-emerald-400"
                    >
                      Sent
                    </Badge>
                  ) : null}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy !== null}
                    onClick={() => sendActivation(u)}
                  >
                    {busy === u.email ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Send className="mr-1.5 h-3.5 w-3.5" />
                        {sent[u.email!] ? "Send again" : "Send activation"}
                      </>
                    )}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};

export default InactiveNudgePanel;
