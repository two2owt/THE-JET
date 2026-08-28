import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAdminUserDirectory } from "@/lib/admin-directory.functions";
import {
  cancelNudgeJob,
  enqueueNudgeJob,
  getNudgeJobStatus,
  previewNudgeEmail,
  type NudgeEmailPreview,
  type NudgeJobStatus,
} from "@/lib/nudge-jobs.functions";
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
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  UserRoundX,
  Send,
  Download,
  FlaskConical,
  Eye,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  ACTIVATION_HTML,
  ACTIVATION_REDIRECT,
  ACTIVATION_SUBJECT,
  SITE_NAME,
} from "@/lib/nudgeTemplate";
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

const daysAgo = (iso: string) =>
  Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));

const ACTIVE_JOB_STATUSES = ["queued", "running"];

/**
 * Accounts that exist and are email-confirmed but have never signed in
 * (the "Last sign-in: N/A" rows in the user directory).
 *
 * Each recipient gets their own activation email. Bulk runs are handed to a
 * persisted background job, so sending continues even if this page is closed;
 * the panel just polls the job for live progress.
 */
export const InactiveNudgePanel = () => {
  const [busy, setBusy] = useState<string | null>(null);
  const [sent, setSent] = useState<Record<string, number>>({});
  const [ledger, setLedger] = useState<NudgeLedger>(() => readNudgeLedger());
  const [cooldownHours, setCooldownHours] = useState<number>(() =>
    readCooldownHours(),
  );
  const [dryRun, setDryRun] = useState(false);
  const [preview, setPreview] = useState<NudgeEmailPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState<string | null>(null);
  const [enqueuing, setEnqueuing] = useState(false);

  const fetchDirectory = useServerFn(getAdminUserDirectory);
  const runPreview = useServerFn(previewNudgeEmail);
  const runEnqueue = useServerFn(enqueueNudgeJob);
  const runJobStatus = useServerFn(getNudgeJobStatus);
  const runCancel = useServerFn(cancelNudgeJob);

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

  const { data: job, refetch: refetchJob } = useQuery<NudgeJobStatus | null>({
    queryKey: ["admin", "nudge-job"],
    queryFn: async () => (await runJobStatus()) ?? null,
    refetchInterval: (q) =>
      q.state.data && ACTIVE_JOB_STATUSES.includes(q.state.data.status)
        ? 3_000
        : false,
  });

  const jobActive = !!job && ACTIVE_JOB_STATUSES.includes(job.status);

  // Refresh the directory once a background run finishes.
  useEffect(() => {
    if (job && !ACTIVE_JOB_STATUSES.includes(job.status)) refetch();
  }, [job?.status]); // eslint-disable-line react-hooks/exhaustive-deps

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

  /** Shows the exact subject, body and personalized link — sends nothing. */
  const openPreview = async (row: DirectoryRow) => {
    if (!row.email) return;
    setPreviewLoading(row.email);
    try {
      const result = await runPreview({
        data: { email: row.email, displayName: row.display_name },
      });
      setPreview(result);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Could not build the email preview",
      );
    } finally {
      setPreviewLoading(null);
    }
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
   * Queues every eligible account into the background job. The worker keeps
   * sending one email per recipient even if this page is closed.
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
    setEnqueuing(true);
    try {
      await runEnqueue({
        data: {
          recipients: queue.map((u) => ({
            email: u.email!,
            display_name: u.display_name,
          })),
        },
      });
      const at = Date.now();
      let next = ledger;
      for (const u of queue) next = recordNudgeSent(u.email!, at);
      setLedger(next);
      toast.success(
        `Queued ${queue.length} activation email(s) — sending continues in the background`,
      );
      refetchJob();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Could not queue the activation emails",
      );
    } finally {
      setEnqueuing(false);
    }
  };

  const cancelJob = async () => {
    if (!job) return;
    try {
      await runCancel({ data: { jobId: job.id } });
      toast.success("Background send canceled");
      refetchJob();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not cancel the job");
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
              disabled={
                busy !== null || enqueuing || jobActive || dormant.length === 0
              }
              onClick={sendToAllRemaining}
            >
              {enqueuing ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Queueing…
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

        {job ? (
          <div className="mt-3 rounded-lg border border-border/50 bg-background/40 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium">
                Background send · {job.status}
                {job.total > 0
                  ? ` · ${job.processed}/${job.total} processed`
                  : ""}
                {job.failed > 0 ? ` · ${job.failed} failed` : ""}
              </span>
              {jobActive ? (
                <Button size="sm" variant="ghost" onClick={cancelJob}>
                  <X className="mr-1.5 h-3.5 w-3.5" />
                  Cancel
                </Button>
              ) : null}
            </div>
            <Progress
              className="mt-2 h-1.5"
              value={
                job.total > 0
                  ? Math.round((job.processed / job.total) * 100)
                  : 0
              }
            />
            {job.last_error ? (
              <p className="mt-2 text-xs text-destructive">{job.last_error}</p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-4 rounded-lg border border-border/50 bg-background/40 p-3">
          <div className="flex items-center gap-2">
            <Switch
              id="nudge-dry-run"
              checked={dryRun}
              onCheckedChange={setDryRun}
              disabled={jobActive}
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
                      variant="ghost"
                      disabled={previewLoading !== null}
                      onClick={() => openPreview(u)}
                    >
                      {previewLoading === u.email ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Eye className="mr-1.5 h-3.5 w-3.5" />
                          Preview email
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={
                        busy !== null || jobActive || (!dryRun && remaining > 0)
                      }
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

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base">
              Email preview · {preview?.email}
            </DialogTitle>
            <DialogDescription className="break-all">
              Subject: {preview?.subject}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[55vh] overflow-auto rounded-lg border border-border/50 bg-white">
            <iframe
              title="Activation email preview"
              className="h-[420px] w-full"
              sandbox=""
              srcDoc={preview?.html ?? ""}
            />
          </div>
          <p className="break-all text-xs text-muted-foreground">
            Personalized sign-in link: {preview?.inviteUrl}
          </p>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default InactiveNudgePanel;
