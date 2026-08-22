import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface MapSyncLatencyMetric {
  stage: string;
  samples: number;
  users: number;
  p50_ms: number;
  p95_ms: number;
  max_ms: number;
  newest_at: string | null;
}

export interface MapSyncLatencyThreshold {
  stage: string;
  warn_ms: number;
  crit_ms: number;
  min_samples: number;
  enabled: boolean;
}

export interface MapSyncLatencyAlert {
  id: string;
  stage: string;
  severity: string;
  status: string;
  message: string;
  observed_p95_ms: number;
  threshold_ms: number;
  sample_count: number;
  created_at: string;
  resolved_at: string | null;
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

/** Rolled-up p50/p95 per sync stage for the requested window. */
export const getMapSyncLatency = createServerFn({ method: "GET" })
  .inputValidator((data: { windowMinutes?: number } | undefined) => ({
    windowMinutes: Math.min(
      Math.max(Number(data?.windowMinutes ?? 60), 5),
      1440,
    ),
  }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const [metrics, thresholds, alerts] = await Promise.all([
      supabaseAdmin.rpc("map_sync_latency_metrics" as never, {
        _window_minutes: data.windowMinutes,
      } as never),
      supabaseAdmin
        .from("map_sync_latency_thresholds" as never)
        .select("stage, warn_ms, crit_ms, min_samples, enabled"),
      supabaseAdmin
        .from("map_sync_latency_alerts" as never)
        .select(
          "id, stage, severity, status, message, observed_p95_ms, threshold_ms, sample_count, created_at, resolved_at",
        )
        .order("created_at", { ascending: false })
        .limit(25),
    ]);
    if (metrics.error) throw new Error(metrics.error.message);
    if (thresholds.error) throw new Error(thresholds.error.message);
    if (alerts.error) throw new Error(alerts.error.message);
    return {
      windowMinutes: data.windowMinutes,
      metrics: (metrics.data ?? []) as unknown as MapSyncLatencyMetric[],
      thresholds: (thresholds.data ?? []) as unknown as MapSyncLatencyThreshold[],
      alerts: (alerts.data ?? []) as unknown as MapSyncLatencyAlert[],
    };
  });

/** Force an immediate degradation evaluation (cron also runs every 10 min). */
export const runMapSyncLatencyCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data, error } = await supabaseAdmin.rpc(
      "check_map_sync_latency" as never,
    );
    if (error) throw new Error(error.message);
    const row = (Array.isArray(data) ? data[0] : data) as
      | { opened: number; resolved: number }
      | undefined;
    return { opened: row?.opened ?? 0, resolved: row?.resolved ?? 0 };
  });
