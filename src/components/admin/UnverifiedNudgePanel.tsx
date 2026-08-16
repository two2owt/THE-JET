import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, MailWarning, Send } from "lucide-react";
import { toast } from "sonner";

type DirectoryRow = {
  id: string;
  email: string | null;
  created_at: string;
  email_confirmed_at: string | null;
  display_name: string | null;
};

type NudgeResult = { email: string; status: string; error?: string };

const daysAgo = (iso: string) =>
  Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));

/**
 * Lists accounts that exist in auth but never confirmed their email address,
 * and lets an admin re-send the branded verification email to one or all of
 * them. Sends go through the same auth email pipeline as sign-up.
 */
export const UnverifiedNudgePanel = () => {
  const [busy, setBusy] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin", "unverified-accounts"],
    staleTime: 30_000,
    queryFn: async (): Promise<DirectoryRow[]> => {
      const { data, error } = await supabase.rpc("admin_user_directory");
      if (error) throw error;
      return ((data ?? []) as DirectoryRow[]).filter((u) => !u.email_confirmed_at && u.email);
    },
  });

  const unverified = data ?? [];

  const sendNudge = async (emails: string[], label: string) => {
    if (!emails.length) return;
    setBusy(label);
    try {
      const redirectTo = `${window.location.origin}/verification-success`;
      const { data: res, error } = await supabase.functions.invoke("admin-bulk-provision-users", {
        body: {
          users: emails.map((email) => ({ email, method: "reverify" })),
          inviteTemplate: { redirectTo },
        },
      });
      if (error) throw error;
      const results = (res?.results ?? []) as NudgeResult[];
      const sent = results.filter((r) => r.status === "resent").length;
      const failed = results.filter((r) => r.status === "error");
      if (sent) toast.success(`Verification email sent to ${sent} account${sent === 1 ? "" : "s"}`);
      if (failed.length) {
        toast.error(failed[0]?.error ?? `Could not send to ${failed.length} account(s)`);
      }
      if (!sent && !failed.length) toast.info("Nothing to send — those addresses are already confirmed");
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send verification emails");
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
              <MailWarning className="h-4 w-4 text-amber-400" />
              Unverified accounts
            </CardTitle>
            <CardDescription>
              Accounts created but never email-confirmed — re-send the verification email
            </CardDescription>
          </div>
          <Button
            size="sm"
            disabled={!unverified.length || busy !== null}
            onClick={() => sendNudge(unverified.map((u) => u.email!), "__all__")}
          >
            {busy === "__all__" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Nudge all ({unverified.length})
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading accounts…
          </div>
        ) : unverified.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Every account has confirmed its email address.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {unverified.map((u) => (
              <li
                key={u.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/50 p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{u.email}</p>
                  <p className="text-xs text-muted-foreground">
                    Signed up {daysAgo(u.created_at)}d ago
                    {u.display_name ? ` · ${u.display_name}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="border-amber-500/40 text-amber-400">
                    Unverified
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy !== null}
                    onClick={() => sendNudge([u.email!], u.email!)}
                  >
                    {busy === u.email ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Send className="mr-1.5 h-3.5 w-3.5" />
                        Nudge
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

export default UnverifiedNudgePanel;
