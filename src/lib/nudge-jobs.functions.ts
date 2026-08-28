import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ACTIVATION_REDIRECT, renderActivationEmail } from "@/lib/nudgeTemplate";

export interface NudgeJobStatus {
  id: string;
  status: string;
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  last_error: string | null;
  created_at: string;
  finished_at: string | null;
}

export interface NudgeEmailPreview {
  email: string;
  subject: string;
  html: string;
  inviteUrl: string;
}

async function assertAdmin(
  supabase: {
    rpc: (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: unknown }>;
  },
  userId: string,
) {
  const { data, error } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (error || data !== true) throw new Response("Forbidden", { status: 403 });
}

/**
 * Renders the exact activation email a recipient would receive, including a
 * live personalized sign-in link. Nothing is sent.
 */
export const previewNudgeEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { email: string; displayName?: string | null }) => {
    const email = String(input?.email ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("A valid recipient email is required");
    }
    return { email, displayName: input.displayName ?? null };
  })
  .handler(async ({ data, context }): Promise<NudgeEmailPreview> => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const link = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: data.email,
      options: { redirectTo: ACTIVATION_REDIRECT },
    });
    const inviteUrl = link.data?.properties?.action_link;
    if (link.error || !inviteUrl) {
      throw new Error(
        link.error?.message ?? "Could not generate a sign-in link for preview",
      );
    }
    const { subject, html } = renderActivationEmail({
      display_name: data.displayName ?? data.email.split("@")[0]!,
      email: data.email,
      invite_url: inviteUrl,
    });
    return { email: data.email, subject, html, inviteUrl };
  });

/** Queues a background activation-email job. Returns the job id. */
export const enqueueNudgeJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      recipients: { email: string; display_name?: string | null }[];
    }) => {
      const recipients = (input?.recipients ?? [])
        .map((r) => ({
          email: String(r.email ?? "").trim().toLowerCase(),
          display_name: r.display_name ?? null,
        }))
        .filter((r) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email));
      if (recipients.length === 0) throw new Error("No valid recipients");
      return { recipients };
    },
  )
  .handler(async ({ data, context }): Promise<{ jobId: string }> => {
    await assertAdmin(context.supabase as never, context.userId);
    const { data: jobId, error } = await context.supabase.rpc(
      "admin_enqueue_nudge_job" as never,
      { _recipients: data.recipients } as never,
    );
    if (error) throw new Error(error.message);
    return { jobId: jobId as unknown as string };
  });

/** Latest activation-email job with live counters. */
export const getNudgeJobStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<NudgeJobStatus | null> => {
    await assertAdmin(context.supabase as never, context.userId);
    const { data, error } = await context.supabase
      .from("admin_nudge_jobs")
      .select(
        "id, status, total, processed, succeeded, failed, last_error, created_at, finished_at",
      )
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as NudgeJobStatus | null) ?? null;
  });

/** Cancels an in-flight job; pending recipients are dropped. */
export const cancelNudgeJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { jobId: string }) => ({
    jobId: String(input?.jobId ?? ""),
  }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { error } = await context.supabase.rpc(
      "admin_cancel_nudge_job" as never,
      { _job_id: data.jobId } as never,
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
