import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { PushDiagnostics } from "./push-diagnostics.server";

export type {
  PushDiagnostics,
  SubscriptionBucket,
  AudienceStat,
  DeliveryError,
} from "./push-diagnostics.server";

export const getPushDiagnostics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PushDiagnostics> => {
    const { data: isAdmin, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (error) throw error;
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { collectPushDiagnostics } = await import("./push-diagnostics.server");
    return collectPushDiagnostics(supabaseAdmin as never);
  });
