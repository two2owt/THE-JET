/**
 * Server-only aggregation for the Admin "Native push audit" panel.
 *
 * Every native (FCM HTTP v1) send attempt made by `notifications-dispatch`
 * writes a row into `native_push_audit`: which device token was targeted, the
 * platform, whether it succeeded, the FCM HTTP status and the error text. This
 * is what makes "why didn't my phone get the notification?" answerable.
 *
 * Callers MUST verify the requester holds the admin role first.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type NativePushAttempt = {
  id: string;
  attemptedAt: string;
  status: "sent" | "failed" | "unregistered" | "skipped" | string;
  platform: string;
  subscriptionId: string | null;
  tokenTail: string | null;
  userId: string | null;
  queueId: string | null;
  category: string | null;
  eventType: string | null;
  audience: string | null;
  httpStatus: number | null;
  providerMessageId: string | null;
  error: string | null;
};

export type NativePushDeviceRollup = {
  subscriptionId: string | null;
  tokenTail: string | null;
  platform: string;
  attempts: number;
  sent: number;
  failed: number;
  unregistered: number;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
};

export type NativePushAudit = {
  generatedAt: string;
  window: { hours: number; sampled: number };
  totals: {
    attempts: number;
    sent: number;
    failed: number;
    unregistered: number;
    skipped: number;
  };
  byPlatform: Array<{
    platform: string;
    attempts: number;
    sent: number;
    failed: number;
  }>;
  devices: NativePushDeviceRollup[];
  attempts: NativePushAttempt[];
};

const WINDOW_HOURS = 168; // 7 days
const SAMPLE_LIMIT = 500;
const RECENT_LIMIT = 100;
const DEVICE_LIMIT = 50;

const newer = (a: string | null, b: string | null) =>
  !a ? b : !b ? a : a > b ? a : b;

type Row = {
  id: string;
  attempted_at: string | null;
  created_at: string;
  status: string;
  platform: string | null;
  subscription_id: string | null;
  token_tail: string | null;
  user_id: string | null;
  queue_id: string | null;
  category: string | null;
  event_type: string | null;
  audience: string | null;
  http_status: number | null;
  provider_message_id: string | null;
  error: string | null;
};

export async function collectNativePushAudit(
  admin: SupabaseClient,
  options: { status?: string } = {},
): Promise<NativePushAudit> {
  const since = new Date(
    Date.now() - WINDOW_HOURS * 60 * 60 * 1000,
  ).toISOString();

  let query = admin
    .from("native_push_audit")
    .select(
      "id, attempted_at, created_at, status, platform, subscription_id, token_tail, user_id, queue_id, category, event_type, audience, http_status, provider_message_id, error",
    )
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(SAMPLE_LIMIT);

  if (options.status && options.status !== "all") {
    query = query.eq("status", options.status);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as Row[];

  const totals = {
    attempts: 0,
    sent: 0,
    failed: 0,
    unregistered: 0,
    skipped: 0,
  };
  const platforms = new Map<
    string,
    { platform: string; attempts: number; sent: number; failed: number }
  >();
  const devices = new Map<string, NativePushDeviceRollup>();
  const attempts: NativePushAttempt[] = [];

  for (const row of rows) {
    const at = row.attempted_at ?? row.created_at;
    const platform = row.platform ?? "unknown";
    const status = row.status;

    totals.attempts += 1;
    if (status === "sent") totals.sent += 1;
    else if (status === "failed") totals.failed += 1;
    else if (status === "unregistered") totals.unregistered += 1;
    else totals.skipped += 1;

    const p = platforms.get(platform) ?? {
      platform,
      attempts: 0,
      sent: 0,
      failed: 0,
    };
    p.attempts += 1;
    if (status === "sent") p.sent += 1;
    else if (status !== "skipped") p.failed += 1;
    platforms.set(platform, p);

    const key = row.subscription_id ?? row.token_tail ?? `unknown:${platform}`;
    const d = devices.get(key) ?? {
      subscriptionId: row.subscription_id,
      tokenTail: row.token_tail,
      platform,
      attempts: 0,
      sent: 0,
      failed: 0,
      unregistered: 0,
      lastAttemptAt: null,
      lastSuccessAt: null,
      lastError: null,
    };
    d.attempts += 1;
    if (status === "sent") {
      d.sent += 1;
      d.lastSuccessAt = newer(d.lastSuccessAt, at);
    } else if (status === "unregistered") {
      d.unregistered += 1;
    } else if (status === "failed") {
      d.failed += 1;
    }
    if (!d.lastAttemptAt || at > d.lastAttemptAt) {
      d.lastAttemptAt = at;
      if (row.error) d.lastError = row.error;
    }
    devices.set(key, d);

    if (attempts.length < RECENT_LIMIT) {
      attempts.push({
        id: row.id,
        attemptedAt: at,
        status,
        platform,
        subscriptionId: row.subscription_id,
        tokenTail: row.token_tail,
        userId: row.user_id,
        queueId: row.queue_id,
        category: row.category,
        eventType: row.event_type,
        audience: row.audience,
        httpStatus: row.http_status,
        providerMessageId: row.provider_message_id,
        error: row.error,
      });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    window: { hours: WINDOW_HOURS, sampled: rows.length },
    totals,
    byPlatform: [...platforms.values()].sort(
      (a, b) => b.attempts - a.attempts,
    ),
    devices: [...devices.values()]
      .sort((a, b) => (b.lastAttemptAt ?? "").localeCompare(a.lastAttemptAt ?? ""))
      .slice(0, DEVICE_LIMIT),
    attempts,
  };
}
