import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { NativePushAudit } from "./native-push-audit.server";

export type {
  NativePushAudit,
  NativePushAttempt,
  NativePushDeviceRollup,
} from "./native-push-audit.server";

const STATUSES = ["all", "sent", "failed", "unregistered", "skipped"] as const;
export type NativePushAuditStatus = (typeof STATUSES)[number];

export const getNativePushAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { status?: string } | undefined) => ({
    status: STATUSES.includes(input?.status as NativePushAuditStatus)
      ? (input!.status as NativePushAuditStatus)
      : ("all" as const),
  }))
  .handler(async ({ data, context }): Promise<NativePushAudit> => {
    const { data: isAdmin, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (error) throw error;
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { collectNativePushAudit } = await import(
      "./native-push-audit.server"
    );
    return collectNativePushAudit(supabaseAdmin as never, {
      status: data.status,
    });
  });
