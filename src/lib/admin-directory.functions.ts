import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface AdminDirectoryRow {
  id: string;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  display_name: string | null;
  onboarding_completed: boolean;
  has_profile: boolean;
}

export interface AdminSyncStatus {
  auth_users: number;
  profiles: number;
  preferences: number;
  missing_profiles: number;
  missing_preferences: number;
  orphan_profiles: number;
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
  if (error || data !== true) {
    throw new Response("Forbidden", { status: 403 });
  }
}

/** Authoritative account list (auth users + profile join). Admin only. */
export const getAdminUserDirectory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data, error } = await supabaseAdmin.rpc(
      "admin_user_directory" as never,
    );
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as AdminDirectoryRow[];
  });

/** Counts comparing auth users against profile/preference rows. Admin only. */
export const getAdminUserSyncStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data, error } = await supabaseAdmin.rpc(
      "admin_user_sync_status" as never,
    );
    if (error) throw new Error(error.message);
    const row = (Array.isArray(data) ? data[0] : data) as
      | AdminSyncStatus
      | undefined;
    return row ?? null;
  });

/** Re-applies the retention cron schedule from retention_settings. Admin only. */
export const applyRetentionSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { error } = await supabaseAdmin.rpc(
      "apply_retention_schedule" as never,
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
