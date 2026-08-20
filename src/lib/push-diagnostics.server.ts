/**
 * Server-only aggregation for the Admin "Push diagnostics" panel.
 *
 * Reads `push_subscriptions`, `notification_deliveries` and the parent
 * `notification_queue` rows with the service-role client. Callers MUST verify
 * the requester holds the admin role before invoking anything here.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type PushChannel = "web" | "native";

export type SubscriptionBucket = {
  platform: string;
  channel: PushChannel;
  active: number;
  inactive: number;
  lastRegisteredAt: string | null;
};

export type AudienceStat = {
  audience: string;
  sent: number;
  failed: number;
  opened: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
};

export type DeliveryError = {
  id: string;
  createdAt: string;
  channel: string;
  audience: string;
  category: string;
  error: string;
};

export type PushDiagnostics = {
  generatedAt: string;
  subscriptions: SubscriptionBucket[];
  totals: { web: number; native: number; inactive: number };
  lastSuccess: { web: string | null; native: string | null };
  window: { hours: number; sampled: number };
  audiences: AudienceStat[];
  errors: DeliveryError[];
};

const WINDOW_HOURS = 72;
const SAMPLE_LIMIT = 1000;

const channelFor = (platform: string): PushChannel =>
  platform === "ios" || platform === "android" ? "native" : "web";

const newer = (a: string | null, b: string | null) =>
  !a ? b : !b ? a : a > b ? a : b;

type QueueRef = { audience: string | null; category: string | null } | null;

export async function collectPushDiagnostics(
  admin: SupabaseClient,
): Promise<PushDiagnostics> {
  const since = new Date(
    Date.now() - WINDOW_HOURS * 60 * 60 * 1000,
  ).toISOString();

  const [subsRes, delivRes, lastWebRes, lastNativeRes] = await Promise.all([
    admin
      .from("push_subscriptions")
      .select("platform, active, created_at, updated_at")
      .limit(5000),
    admin
      .from("notification_deliveries")
      .select(
        "id, created_at, channel, status, error, opened_at, notification_queue(audience, category)",
      )
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(SAMPLE_LIMIT),
    admin
      .from("notification_deliveries")
      .select("created_at")
      .eq("channel", "web")
      .eq("status", "sent")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("notification_deliveries")
      .select("created_at")
      .eq("channel", "native")
      .eq("status", "sent")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (subsRes.error) throw subsRes.error;
  if (delivRes.error) throw delivRes.error;

  const buckets = new Map<string, SubscriptionBucket>();
  const totals = { web: 0, native: 0, inactive: 0 };

  for (const row of subsRes.data ?? []) {
    const platform = row.platform ?? "web";
    const channel = channelFor(platform);
    const bucket = buckets.get(platform) ?? {
      platform,
      channel,
      active: 0,
      inactive: 0,
      lastRegisteredAt: null,
    };
    if (row.active) {
      bucket.active += 1;
      totals[channel] += 1;
    } else {
      bucket.inactive += 1;
      totals.inactive += 1;
    }
    bucket.lastRegisteredAt = newer(
      bucket.lastRegisteredAt,
      row.updated_at ?? row.created_at ?? null,
    );
    buckets.set(platform, bucket);
  }

  const audiences = new Map<string, AudienceStat>();
  const errors: DeliveryError[] = [];

  for (const row of (delivRes.data ?? []) as Array<{
    id: string;
    created_at: string;
    channel: string;
    status: string;
    error: string | null;
    opened_at: string | null;
    notification_queue: QueueRef | QueueRef[];
  }>) {
    const queue = Array.isArray(row.notification_queue)
      ? (row.notification_queue[0] ?? null)
      : row.notification_queue;
    const audience = queue?.audience ?? "unknown";
    const stat = audiences.get(audience) ?? {
      audience,
      sent: 0,
      failed: 0,
      opened: 0,
      lastSuccessAt: null,
      lastFailureAt: null,
    };

    if (row.status === "failed") {
      stat.failed += 1;
      stat.lastFailureAt = newer(stat.lastFailureAt, row.created_at);
      if (errors.length < 25) {
        errors.push({
          id: row.id,
          createdAt: row.created_at,
          channel: row.channel,
          audience,
          category: queue?.category ?? "unknown",
          error: row.error ?? "unknown error",
        });
      }
    } else {
      stat.sent += 1;
      stat.lastSuccessAt = newer(stat.lastSuccessAt, row.created_at);
      if (row.status === "opened" || row.opened_at) stat.opened += 1;
    }

    audiences.set(audience, stat);
  }

  return {
    generatedAt: new Date().toISOString(),
    subscriptions: [...buckets.values()].sort((a, b) =>
      a.platform.localeCompare(b.platform),
    ),
    totals,
    lastSuccess: {
      web: lastWebRes.data?.created_at ?? null,
      native: lastNativeRes.data?.created_at ?? null,
    },
    window: { hours: WINDOW_HOURS, sampled: delivRes.data?.length ?? 0 },
    audiences: [...audiences.values()].sort(
      (a, b) => b.sent + b.failed - (a.sent + a.failed),
    ),
    errors,
  };
}
