/**
 * Server-only aggregation for the Admin "Push diagnostics" panel.
 *
 * Reads `push_notifications`, `notification_deliveries` and the parent
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

/** User-level reach report: who is eligible vs who can actually be delivered to. */
export type PushCoverage = {
  totalUsers: number;
  optedOutUsers: number;
  eligibleUsers: number;
  usersWithDevice: number;
  usersWebOnly: number;
  usersNativeOnly: number;
  usersBothChannels: number;
  usersInactiveOnly: number;
  eligibleWithoutDevice: number;
  optedOutWithDevice: number;
  deliveredUsers: number;
  failedUsers: number;
  reachRate: number;
  deliveryRate: number;
};

export type PushDiagnostics = {
  generatedAt: string;
  subscriptions: SubscriptionBucket[];
  totals: { web: number; native: number; inactive: number };
  lastSuccess: { web: string | null; native: string | null };
  window: { hours: number; sampled: number };
  audiences: AudienceStat[];
  errors: DeliveryError[];
  coverage: PushCoverage;
};

const WINDOW_HOURS = 72;
const SAMPLE_LIMIT = 1000;

const channelFor = (platform: string): PushChannel =>
  platform === "ios" || platform === "android" ? "native" : "web";

const pct = (part: number, whole: number) =>
  whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;

const newer = (a: string | null, b: string | null) =>
  !a ? b : !b ? a : a > b ? a : b;

type QueueRef = { audience: string | null; category: string | null } | null;

export async function collectPushDiagnostics(
  admin: SupabaseClient,
): Promise<PushDiagnostics> {
  const since = new Date(
    Date.now() - WINDOW_HOURS * 60 * 60 * 1000,
  ).toISOString();

  const [
    subsRes,
    delivRes,
    lastWebRes,
    lastNativeRes,
    profilesRes,
    optOutRes,
  ] = await Promise.all([
    admin
      .from("push_notifications")
      .select("user_id, platform, active, created_at, updated_at")
      .limit(5000),
    admin
      .from("notification_deliveries")
      .select(
        "id, user_id, created_at, channel, status, error, opened_at, notification_queue(audience, category)",
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
    admin.from("profiles").select("id").limit(20000),
    admin
      .from("user_preferences")
      .select("user_id")
      .eq("notifications_enabled", false)
      .limit(20000),
  ]);

  if (subsRes.error) throw subsRes.error;
  if (delivRes.error) throw delivRes.error;
  if (profilesRes.error) throw profilesRes.error;
  if (optOutRes.error) throw optOutRes.error;

  const buckets = new Map<string, SubscriptionBucket>();
  const totals = { web: 0, native: 0, inactive: 0 };
  const deviceByUser = new Map<
    string,
    { web: boolean; native: boolean; inactiveOnly: boolean }
  >();

  for (const row of subsRes.data ?? []) {
    const platform = row.platform ?? "web";
    const channel = channelFor(platform);
    const userId = (row as { user_id: string | null }).user_id;
    if (userId) {
      const entry = deviceByUser.get(userId) ?? {
        web: false,
        native: false,
        inactiveOnly: true,
      };
      if (row.active) {
        entry.inactiveOnly = false;
        if (channel === "web") entry.web = true;
        else entry.native = true;
      }
      deviceByUser.set(userId, entry);
    }
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
  const deliveredUserIds = new Set<string>();
  const failedUserIds = new Set<string>();

  for (const row of (delivRes.data ?? []) as Array<{
    id: string;
    user_id: string | null;
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
      if (row.user_id) failedUserIds.add(row.user_id);
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
      if (row.user_id) deliveredUserIds.add(row.user_id);
      if (row.status === "opened" || row.opened_at) stat.opened += 1;
    }

    audiences.set(audience, stat);
  }

  const optedOut = new Set(
    (optOutRes.data ?? []).map((r: { user_id: string }) => r.user_id),
  );
  const allUserIds = (profilesRes.data ?? []).map((p: { id: string }) => p.id);
  const eligibleUserIds = allUserIds.filter((id) => !optedOut.has(id));

  let usersWithDevice = 0;
  let usersWebOnly = 0;
  let usersNativeOnly = 0;
  let usersBothChannels = 0;
  let usersInactiveOnly = 0;
  for (const id of eligibleUserIds) {
    const entry = deviceByUser.get(id);
    if (!entry) continue;
    if (entry.web || entry.native) {
      usersWithDevice += 1;
      if (entry.web && entry.native) usersBothChannels += 1;
      else if (entry.web) usersWebOnly += 1;
      else usersNativeOnly += 1;
    } else if (entry.inactiveOnly) {
      usersInactiveOnly += 1;
    }
  }

  let optedOutWithDevice = 0;
  for (const id of optedOut) {
    const entry = deviceByUser.get(id);
    if (entry && (entry.web || entry.native)) optedOutWithDevice += 1;
  }

  const deliveredEligible = eligibleUserIds.filter((id) =>
    deliveredUserIds.has(id),
  ).length;

  const coverage: PushCoverage = {
    totalUsers: allUserIds.length,
    optedOutUsers: optedOut.size,
    eligibleUsers: eligibleUserIds.length,
    usersWithDevice,
    usersWebOnly,
    usersNativeOnly,
    usersBothChannels,
    usersInactiveOnly,
    eligibleWithoutDevice: eligibleUserIds.length - usersWithDevice,
    optedOutWithDevice,
    deliveredUsers: deliveredEligible,
    failedUsers: failedUserIds.size,
    reachRate: pct(usersWithDevice, eligibleUserIds.length),
    deliveryRate: pct(deliveredEligible, usersWithDevice),
  };

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
    coverage,
  };
}
