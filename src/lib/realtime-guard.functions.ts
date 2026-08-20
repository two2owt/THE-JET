import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface RealtimeAuditRow {
  table_name: string;
  approved: boolean;
  sensitivity: "private" | "public" | "unknown";
  rls_enabled: boolean;
  replica_identity: string;
  replica_identity_acknowledged: boolean;
  unscoped_select_policies: string[];
}

async function assertAdmin(
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  },
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

/** Current Realtime publication posture: what broadcasts, and under which rules. */
export const getRealtimePublicationAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("realtime_publication_audit" as never);
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as RealtimeAuditRow[];
  });

/** Force an immediate evaluation (cron also runs it every 15 minutes). */
export const runRealtimeGuardCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("check_realtime_guard" as never);
    if (error) throw new Error(error.message);
    const row = (Array.isArray(data) ? data[0] : data) as
      | { opened: number; resolved: number }
      | undefined;
    return { opened: row?.opened ?? 0, resolved: row?.resolved ?? 0 };
  });
