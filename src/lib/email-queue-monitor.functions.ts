import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface EmailQueueMetric {
  queue_name: string;
  queue_depth: number;
  processing_lag_seconds: number;
  dlq_depth: number;
  newest_message_age_seconds: number;
  total_enqueued: number;
}

async function assertAdmin(
  supabase: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> },
  userId: string,
) {
  const { data, error } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (error || data !== true) {
    throw new Response("Forbidden", { status: 403 });
  }
}

/** Live pgmq depth / lag / DLQ metrics for the email queues. Admins only. */
export const getEmailQueueMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("email_queue_metrics" as never);
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as EmailQueueMetric[];
  });

/** Force an immediate threshold evaluation (the cron job also runs every 5 min). */
export const runEmailQueueHealthCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("check_email_queue_health" as never);
    if (error) throw new Error(error.message);
    const row = (Array.isArray(data) ? data[0] : data) as
      | { opened: number; resolved: number }
      | undefined;
    return { opened: row?.opened ?? 0, resolved: row?.resolved ?? 0 };
  });
