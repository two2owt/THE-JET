/**
 * Queue worker for the unified notification bus.
 *
 * Claims a batch of pending jobs (atomic, SKIP LOCKED), resolves recipients,
 * applies per-user category opt-outs and quiet hours, then fans out to web
 * push (VAPID) and native devices (FCM HTTP v1). Every attempt is recorded in
 * `notification_deliveries` and mirrored into `notification_logs` for the
 * in-app Alerts tab.
 *
 * Invoked by pg_cron every minute and woken directly by notifications-enqueue.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "https://esm.sh/web-push@3.6.7";
import { corsHeaders, logVersion } from "../_shared/cors.ts";
import { sendFcmV1 } from "../_shared/fcm.ts";
import { getServiceRoleKey } from "../_shared/supabase-keys.ts";
import {
  buildDataPayload,
  categoryAllowed,
  DEFAULT_SETTINGS,
  isQuietHours,
  nextDeliverableAt,
  type UserNotificationSettings,
} from "../_shared/notifications.ts";

const FUNCTION_NAME = "notifications-dispatch";
logVersion(FUNCTION_NAME);

const BATCH_SIZE = 10;

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    getServiceRoleKey(),
  );

  const vapidPublic = Deno.env.get("VITE_VAPID_PUBLIC_KEY");
  const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY");
  if (vapidPublic && vapidPrivate) {
    webpush.setVapidDetails("mailto:support@jet-around.com", vapidPublic, vapidPrivate);
  }

  try {
    const { data: jobs, error: claimErr } = await supabase.rpc("claim_notification_batch", {
      _limit: BATCH_SIZE,
    });
    if (claimErr) throw claimErr;
    if (!jobs || jobs.length === 0) return json({ ok: true, processed: 0 });

    const results: Array<Record<string, unknown>> = [];

    for (const job of jobs as any[]) {
      try {
        // ---- 1. Resolve recipients -------------------------------------
        let userIds: string[] = [];

        if (job.audience === "users") {
          userIds = (job.target_user_ids ?? []) as string[];
        } else if (job.audience === "favorites") {
          const clauses: string[] = [];
          if (job.deal_id) clauses.push(`deal_id.eq.${job.deal_id}`);
          if (job.venue_id) clauses.push(`venue_id.eq.${job.venue_id}`);
          const { data: favs } = await supabase
            .from("user_favorites")
            .select("user_id")
            .or(clauses.join(","));
          userIds = (favs ?? []).map((f: any) => f.user_id);
        } else if (job.audience === "neighborhood") {
          const { data: locs } = await supabase
            .from("user_locations")
            .select("user_id")
            .eq("current_neighborhood_id", job.neighborhood_id);
          userIds = (locs ?? []).map((l: any) => l.user_id);
        } else {
          const { data: subs } = await supabase
            .from("push_subscriptions")
            .select("user_id")
            .eq("active", true);
          userIds = (subs ?? []).map((s: any) => s.user_id);
        }

        userIds = Array.from(new Set(userIds.filter(Boolean)));

        if (userIds.length === 0) {
          await supabase
            .from("notification_queue")
            .update({
              status: "skipped",
              processed_at: new Date().toISOString(),
              stats: { reason: "no_recipients" },
            })
            .eq("id", job.id);
          results.push({ id: job.id, skipped: "no_recipients" });
          continue;
        }

        // ---- 2. Preferences: master switch, category, quiet hours ------
        const { data: prefRows } = await supabase
          .from("user_preferences")
          .select("user_id, notifications_enabled")
          .in("user_id", userIds);
        const prefById = new Map((prefRows ?? []).map((p: any) => [p.user_id, p]));

        const { data: settingsRows } = await supabase
          .from("user_notification_settings")
          .select("*")
          .in("user_id", userIds);
        const settingsById = new Map(
          (settingsRows ?? []).map((s: any) => [s.user_id, s as UserNotificationSettings]),
        );

        const now = new Date();
        const eligible: string[] = [];
        let deferUntil: string | null = null;
        let optedOut = 0;
        let deferred = 0;

        for (const uid of userIds) {
          const pref = prefById.get(uid);
          if (pref && pref.notifications_enabled === false) {
            optedOut++;
            continue;
          }
          const settings: UserNotificationSettings =
            settingsById.get(uid) ?? { user_id: uid, ...DEFAULT_SETTINGS };
          if (!categoryAllowed(settings, job.category)) {
            optedOut++;
            continue;
          }
          if (job.category !== "system" && isQuietHours(settings, now)) {
            deferred++;
            const candidate = nextDeliverableAt(settings, now);
            if (!deferUntil || candidate < deferUntil) deferUntil = candidate;
            continue;
          }
          eligible.push(uid);
        }

        if (eligible.length === 0) {
          if (deferred > 0 && deferUntil && job.attempts < job.max_attempts) {
            await supabase
              .from("notification_queue")
              .update({
                status: "pending",
                scheduled_at: deferUntil,
                locked_at: null,
                stats: { deferred, opted_out: optedOut },
              })
              .eq("id", job.id);
            results.push({ id: job.id, deferred_until: deferUntil });
          } else {
            await supabase
              .from("notification_queue")
              .update({
                status: "skipped",
                processed_at: new Date().toISOString(),
                stats: { reason: "all_opted_out", opted_out: optedOut, deferred },
              })
              .eq("id", job.id);
            results.push({ id: job.id, skipped: "all_opted_out" });
          }
          continue;
        }

        // ---- 3. Fan out -------------------------------------------------
        const { data: subs } = await supabase
          .from("push_subscriptions")
          .select("id, user_id, endpoint, p256dh_key, auth_key, platform")
          .eq("active", true)
          .in("user_id", eligible);

        const data = buildDataPayload({
          queueId: job.id,
          dealId: job.deal_id,
          venueId: job.venue_id,
          venueName: job.data?.venueName ?? "",
          layers: job.data?.layers ?? "",
          url: job.data?.url || null,
          category: job.category,
        });

        const webBody = JSON.stringify({
          title: job.title,
          body: job.body,
          icon: "/pwa-192x192.png",
          badge: "/pwa-192x192.png",
          tag: `jet-${job.event_type}-${job.deal_id ?? job.venue_id ?? job.id}`,
          data,
        });

        let webSent = 0;
        let nativeSent = 0;
        const invalid: string[] = [];
        const deliveries: Array<Record<string, unknown>> = [];

        await Promise.allSettled(
          (subs ?? []).map(async (sub: any) => {
            const isNative = sub.platform === "ios" || sub.platform === "android";
            try {
              if (isNative) {
                const res = await sendFcmV1(sub.endpoint, { title: job.title, body: job.body }, data);
                if (!res.ok) {
                  if (res.unregistered) invalid.push(sub.id);
                  throw new Error(res.error ?? "fcm failed");
                }
                nativeSent++;
              } else {
                if (!vapidPublic || !vapidPrivate) throw new Error("VAPID keys not configured");
                await webpush.sendNotification(
                  {
                    endpoint: sub.endpoint,
                    keys: { p256dh: sub.p256dh_key, auth: sub.auth_key },
                  },
                  webBody,
                );
                webSent++;
              }
              deliveries.push({
                queue_id: job.id,
                user_id: sub.user_id,
                subscription_id: sub.id,
                channel: isNative ? "native" : "web",
                status: "sent",
              });
            } catch (err: any) {
              if (err?.statusCode === 404 || err?.statusCode === 410) invalid.push(sub.id);
              deliveries.push({
                queue_id: job.id,
                user_id: sub.user_id,
                subscription_id: sub.id,
                channel: isNative ? "native" : "web",
                status: "failed",
                error: String(err?.message ?? err).slice(0, 400),
              });
            }
          }),
        );

        if (invalid.length > 0) {
          await supabase
            .from("push_subscriptions")
            .update({ active: false })
            .in("id", invalid);
        }
        if (deliveries.length > 0) {
          await supabase.from("notification_deliveries").insert(deliveries);
        }

        // In-app Alerts feed — one row per eligible user, even without a device.
        await supabase.from("notification_logs").insert(
          eligible.map((uid) => ({
            user_id: uid,
            title: job.title,
            message: job.body,
            notification_type: job.event_type,
            deal_id: job.deal_id ?? null,
            neighborhood_id: job.neighborhood_id ?? null,
          })),
        );

        await supabase
          .from("notification_queue")
          .update({
            status: "sent",
            processed_at: new Date().toISOString(),
            last_error: null,
            stats: {
              recipients: eligible.length,
              web_sent: webSent,
              native_sent: nativeSent,
              devices: subs?.length ?? 0,
              opted_out: optedOut,
              deferred,
              deactivated: invalid.length,
            },
          })
          .eq("id", job.id);

        results.push({ id: job.id, web_sent: webSent, native_sent: nativeSent });
      } catch (err: any) {
        const message = String(err?.message ?? err).slice(0, 500);
        console.error(`[${FUNCTION_NAME}] job ${job.id} failed:`, message);
        const exhausted = (job.attempts ?? 1) >= (job.max_attempts ?? 5);
        await supabase
          .from("notification_queue")
          .update({
            status: exhausted ? "failed" : "pending",
            locked_at: null,
            last_error: message,
            // exponential backoff: 1m, 2m, 4m, 8m…
            scheduled_at: exhausted
              ? job.scheduled_at
              : new Date(Date.now() + 60_000 * 2 ** ((job.attempts ?? 1) - 1)).toISOString(),
            processed_at: exhausted ? new Date().toISOString() : null,
          })
          .eq("id", job.id);
        results.push({ id: job.id, error: message });
      }
    }

    return json({ ok: true, processed: jobs.length, results });
  } catch (err) {
    console.error(`[${FUNCTION_NAME}]`, err instanceof Error ? err.message : err);
    return json({ error: "Internal server error" }, 500);
  }
});