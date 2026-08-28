import { useMemo, useState } from "react";
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
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, UserRoundX, Send, Download, FlaskConical } from "lucide-react";
import { toast } from "sonner";
import {
  COOLDOWN_OPTIONS,
  buildNudgeCsv,
  cooldownRemainingMs,
  downloadCsv,
  formatCooldownRemaining,
  readCooldownHours,
  readNudgeLedger,
  recordNudgeSent,
  writeCooldownHours,
  type NudgeLedger,
} from "@/lib/nudgeCooldown";


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
  const [ledger, setLedger] = useState<NudgeLedger>(() => readNudgeLedger());
  const [cooldownHours, setCooldownHours] = useState<number>(() =>
    readCooldownHours(),
  );
  const [dryRun, setDryRun] = useState(false);

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

  const dormant = useMemo(() => data ?? [], [data]);

  /** Recipients past their cooldown window — the audience an actual run hits. */
  const eligible = useMemo(
    () =>
      dormant.filter(
        (u) => cooldownRemainingMs(u.email, ledger, cooldownHours) === 0,
      ),
    [dormant, ledger, cooldownHours],
  );

  const cooledDownCount = dormant.length - eligible.length;

  const applyCooldownHours = (hours: number) => {
    setCooldownHours(hours);
    writeCooldownHours(hours);
  };

  const exportCsv = () => {
    if (dormant.length === 0) {
      toast.info("No accounts to export.");
      return;
    }
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(
      `jet-never-signed-in-${stamp}.csv`,
      buildNudgeCsv(dormant, ledger, cooldownHours),
    );
    toast.success(`Exported ${dormant.length} recipient(s) to CSV`);
  };

  /** Sends exactly one activation email to one recipient. */
  const sendOne = async (row: DirectoryRow): Promise<boolean> => {
    const email = row.email;
    if (!email) return false;
    const { data: res, error } = await supabase.functions.invoke(
      "admin-bulk-provision-users",
      {
        body: {
          // One recipient per invocation — no list looping server-side.
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
    const at = Date.now();
    setSent((prev) => ({ ...prev, [email]: at }));
    setLedger(recordNudgeSent(email, at));
    return true;
  };

  const sendActivation = async (row: DirectoryRow) => {
    const email = row.email;
    if (!email) return;
    if (dryRun) {
      toast.info(`Dry run — would send an activation email to ${email}`);
      return;
    }
    const remaining = cooldownRemainingMs(email, ledger, cooldownHours);
    if (remaining > 0) {
      toast.warning(
        `${email} was nudged recently — eligible again in ${formatCooldownRemaining(remaining)}`,
      );
      return;
    }
    setBusy(email);
    try {
      await sendOne(row);
      toast.success(`Activation email sent to ${email}`);
      refetch();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Could not send the activation email",
      );
    } finally {
      setBusy(null);
    }
  };

  /**
   * Walks every confirmed never-signed-in account that is past its resend
   * cooldown and sends each person their own activation email, one request at
   * a time with a short pause between sends. In dry-run mode nothing is sent —
   * the panel only reports who would be contacted.
   */
  const sendToAllRemaining = async () => {
    const queue = eligible.filter((u) => !!u.email);
    if (queue.length === 0) {
      toast.info(
        cooledDownCount > 0
          ? "Every listed account is still inside the resend cooldown."
          : "There are no accounts to email.",
      );
      return;
    }
    if (dryRun) {
      toast.info(
        `Dry run — would email ${queue.length} account(s): ${queue
          .slice(0, 3)
          .map((u) => u.email)
          .join(", ")}${queue.length > 3 ? "…" : ""}`,
      );
      return;
    }
    setRunAll({ done: 0, total: queue.length });
    let ok = 0;
    const failed: string[] = [];
    for (const row of queue) {
      setBusy(row.email);
      try {
        await sendOne(row);
        ok++;
      } catch (e) {
        failed.push(row.email!);
        console.error("Activation send failed", row.email, e);
      }
      setRunAll((prev) => (prev ? { ...prev, done: prev.done + 1 } : prev));
      await new Promise((r) => setTimeout(r, 600));
    }
    setBusy(null);
    setRunAll(null);
    if (failed.length) {
      toast.warning(
        `Sent ${ok} activation email(s); ${failed.length} failed (${failed.slice(0, 3).join(", ")}${failed.length > 3 ? "…" : ""})`,
      );
    } else {
      toast.success(`Sent ${ok} activation email(s)`);
    }
    refetch();
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
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{dormant.length} account(s)</Badge>
            <Badge variant="outline">{eligible.length} eligible</Badge>
            <Button size="sm" variant="outline" onClick={exportCsv}>
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Export CSV
            </Button>
            <Button
              size="sm"
              variant={dryRun ? "outline" : "default"}
              disabled={busy !== null || runAll !== null || dormant.length === 0}
              onClick={sendToAllRemaining}
            >
              {runAll ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Sending {runAll.done}/{runAll.total}
                </>
              ) : (
                <>
                  {dryRun ? (
                    <FlaskConical className="mr-1.5 h-3.5 w-3.5" />
                  ) : (
                    <Send className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  {dryRun ? "Preview all remaining" : "Send to all remaining"}
                </>
              )}
            </Button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-4 rounded-lg border border-border/50 bg-background/40 p-3">
          <div className="flex items-center gap-2">
            <Switch
              id="nudge-dry-run"
              checked={dryRun}
              onCheckedChange={setDryRun}
              disabled={runAll !== null}
            />
            <Label htmlFor="nudge-dry-run" className="text-xs">
              Dry run (no emails sent)
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="nudge-cooldown" className="text-xs">
              Resend cooldown
            </Label>
            <Select
              value={String(cooldownHours)}
              onValueChange={(v) => applyCooldownHours(Number(v))}
            >
              <SelectTrigger id="nudge-cooldown" className="h-8 w-[140px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COOLDOWN_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={String(opt.value)}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {cooledDownCount > 0 ? (
            <span className="text-xs text-muted-foreground">
              {cooledDownCount} account(s) waiting out the cooldown
            </span>
          ) : null}
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
            {dormant.map((u) => {
              const remaining = cooldownRemainingMs(
                u.email,
                ledger,
                cooldownHours,
              );
              const lastSent = u.email
                ? ledger[u.email.toLowerCase()]
                : undefined;
              return (
                <li
                  key={u.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/50 p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{u.email}</p>
                    <p className="text-xs text-muted-foreground">
                      Created {daysAgo(u.created_at)}d ago · never signed in
                      {u.display_name ? ` · ${u.display_name}` : ""}
                      {lastSent
                        ? ` · last nudged ${new Date(lastSent).toLocaleDateString()}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {remaining > 0 ? (
                      <Badge variant="outline" className="text-muted-foreground">
                        Cooldown {formatCooldownRemaining(remaining)}
                      </Badge>
                    ) : sent[u.email!] ? (
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
                      disabled={busy !== null || (!dryRun && remaining > 0)}
                      onClick={() => sendActivation(u)}
                    >
                      {busy === u.email ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          {dryRun ? (
                            <FlaskConical className="mr-1.5 h-3.5 w-3.5" />
                          ) : (
                            <Send className="mr-1.5 h-3.5 w-3.5" />
                          )}
                          {dryRun
                            ? "Preview"
                            : lastSent
                              ? "Send again"
                              : "Send activation"}
                        </>
                      )}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};

export default InactiveNudgePanel;
