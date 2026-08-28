import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import {
  ACTIVATION_REDIRECT,
  renderActivationEmail,
} from "@/lib/nudgeTemplate";

/**
 * Background worker for admin "never signed in" activation emails.
 *
 * Poked by the wake-on-enqueue pg_cron dispatcher, so a queued bulk send keeps
 * running after the admin closes the page.
 *
 * Safety rails:
 * - bounded batch per invocation (BATCH_SIZE)
 * - single-flight lease on the job row (a second concurrent run exits)
 * - per-item progress written in the same step that sends, so re-runs skip work
 * - circuit breaker: repeated failures park the job in `paused`
 *
 * Public prefix: authorization is verified inside the handler (service role key
 * or the cron hook secret).
 */

const BATCH_SIZE = 5;
const LEASE_MS = 60_000;
const MAX_CONSECUTIVE_FAILURES = 5;
const SEND_DELAY_MS = 400;

type JobRow = {
  id: string;
  status: string;
  processed: number;
  succeeded: number;
  failed: number;
  consecutive_failures: number;
};

type ItemRow = {
  id: string;
  email: string;
  display_name: string | null;
  attempts: number;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const Route = createFileRoute("/api/public/nudge-queue/process")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const supabaseUrl = process.env["SUPABASE_URL"];
        const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
        const hookSecret = process.env["NOTIFY_ADMIN_HOOK_SECRET"];
        const resendKey = process.env["RESEND_API_KEY"];
        const fromAddress =
          process.env["RESEND_FROM_EMAIL"] ?? "JET <noreply@jet-around.com>";

        if (!supabaseUrl || !serviceKey) {
          return Response.json(
            { error: "Server configuration error" },
            { status: 500 },
          );
        }

        const token = (request.headers.get("authorization") ?? "")
          .replace("Bearer ", "")
          .trim();
        const authorized =
          !!token && (token === serviceKey || (!!hookSecret && token === hookSecret));
        if (!authorized) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const admin = createClient(supabaseUrl, serviceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        // --- Pick up an active job -------------------------------------------
        const { data: jobs } = await admin
          .from("admin_nudge_jobs")
          .select("id, status, processed, succeeded, failed, consecutive_failures")
          .in("status", ["queued", "running"])
          .order("created_at", { ascending: true })
          .limit(1);

        const job = (jobs ?? [])[0] as JobRow | undefined;
        if (!job) return Response.json({ ok: true, idle: true });

        // --- Single-flight lease ---------------------------------------------
        const nowIso = new Date().toISOString();
        const leaseUntil = new Date(Date.now() + LEASE_MS).toISOString();
        const { data: leased } = await admin
          .from("admin_nudge_jobs")
          .update({
            status: "running",
            lease_expires_at: leaseUntil,
            updated_at: nowIso,
          })
          .eq("id", job.id)
          .or(`lease_expires_at.is.null,lease_expires_at.lt.${nowIso}`)
          .select("id")
          .maybeSingle();

        if (!leased) {
          return Response.json({ ok: true, skipped: "locked" });
        }

        if (!resendKey) {
          await admin
            .from("admin_nudge_jobs")
            .update({
              status: "paused",
              last_error: "RESEND_API_KEY is not configured",
              lease_expires_at: null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", job.id);
          return Response.json(
            { error: "RESEND_API_KEY is not configured" },
            { status: 500 },
          );
        }

        // --- Bounded batch ----------------------------------------------------
        const { data: items } = await admin
          .from("admin_nudge_job_items")
          .select("id, email, display_name, attempts")
          .eq("job_id", job.id)
          .eq("status", "pending")
          .order("created_at", { ascending: true })
          .limit(BATCH_SIZE);

        const batch = (items ?? []) as ItemRow[];
        let succeeded = 0;
        let failed = 0;
        let consecutive = job.consecutive_failures ?? 0;
        let lastError: string | null = null;

        for (const item of batch) {
          try {
            // Mint a personalized single-use sign-in link.
            const link = await admin.auth.admin.generateLink({
              type: "magiclink",
              email: item.email,
              options: { redirectTo: ACTIVATION_REDIRECT },
            });
            const actionLink = link.data?.properties?.action_link;
            if (link.error || !actionLink) {
              throw new Error(link.error?.message ?? "Could not create sign-in link");
            }

            const { subject, html } = renderActivationEmail({
              display_name: item.display_name ?? item.email.split("@")[0]!,
              email: item.email,
              invite_url: actionLink,
            });

            const res = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${resendKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                from: fromAddress,
                to: [item.email],
                subject,
                html,
              }),
            });

            if (res.status === 429 || res.status >= 500) {
              // Transient: leave the item pending, stop the batch, retry next tick.
              lastError = `Resend responded ${res.status}`;
              await admin
                .from("admin_nudge_jobs")
                .update({
                  status: "running",
                  last_error: lastError,
                  lease_expires_at: null,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", job.id);
              return Response.json({ ok: true, retryLater: true, error: lastError });
            }

            if (!res.ok) {
              throw new Error(`Resend error ${res.status}: ${await res.text()}`);
            }

            await admin
              .from("admin_nudge_job_items")
              .update({
                status: "sent",
                attempts: item.attempts + 1,
                processed_at: new Date().toISOString(),
                error: null,
              })
              .eq("id", item.id);
            succeeded++;
            consecutive = 0;
          } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            lastError = message;
            consecutive++;
            await admin
              .from("admin_nudge_job_items")
              .update({
                status: "failed",
                attempts: item.attempts + 1,
                processed_at: new Date().toISOString(),
                error: message.slice(0, 500),
              })
              .eq("id", item.id);
            failed++;
          }

          if (consecutive >= MAX_CONSECUTIVE_FAILURES) break;
          await sleep(SEND_DELAY_MS);
        }

        // --- Progress + terminal state ---------------------------------------
        const { count: remaining } = await admin
          .from("admin_nudge_job_items")
          .select("id", { count: "exact", head: true })
          .eq("job_id", job.id)
          .eq("status", "pending");

        const done = (remaining ?? 0) === 0;
        const tripped = consecutive >= MAX_CONSECUTIVE_FAILURES;

        await admin
          .from("admin_nudge_jobs")
          .update({
            status: tripped ? "paused" : done ? "completed" : "running",
            processed: job.processed + succeeded + failed,
            succeeded: job.succeeded + succeeded,
            failed: job.failed + failed,
            consecutive_failures: consecutive,
            last_error: lastError,
            lease_expires_at: null,
            finished_at: done || tripped ? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id);

        if (done || tripped) {
          // Let the dispatcher unschedule itself once nothing is pending.
          await admin.rpc("nudge_queue_dispatch" as never);
        }

        return Response.json({
          ok: true,
          jobId: job.id,
          sent: succeeded,
          failed,
          remaining: remaining ?? 0,
          paused: tripped,
        });
      },
    },
  },
});
