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
import { internalError, jsonResponse } from "../_shared/http.ts";
import { describeFcmConfig, sendFcmV1 } from "../_shared/fcm.ts";
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

const json = jsonResponse;

/** Last 8 chars of a device token — enough to identify a device, never the token. */
const tokenTail = (token: string) =>
  token ? `…${token.replace(/^fcm:/, "").slice(-8)}` : null;

const b64urlToBytes = (s: string): Uint8Array => {
  const norm = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(norm + "=".repeat((4 - (norm.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

const bytesToB64url = (b: Uint8Array): string =>
  btoa(String.fromCharCode(...b))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

/**
 * True when `priv` is the mathematical pair of `pub`. Push providers reject
 * a mismatched VAPID JWT with 403 ("invalid JWT provided" / "BadJwtToken"),
 * so we detect the mismatch locally instead of burning a delivery attempt.
 */
async function vapidPairs(pub: string, priv: string): Promise<boolean> {
  try {
    const p = b64urlToBytes(pub);
    if (p.length !== 65 || p[0] !== 4) return false;
    const x = bytesToB64url(p.slice(1, 33));
    const y = bytesToB64url(p.slice(33, 65));
    const d = priv.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const alg = { name: "ECDSA", namedCurve: "P-256" } as const;
    const privKey = await crypto.subtle.importKey(
      "jwk",
      { kty: "EC", crv: "P-256", x, y, d, ext: true },
      alg,
      false,
      ["sign"],
    );
    const pubKey = await crypto.subtle.importKey(
      "jwk",
      { kty: "EC", crv: "P-256", x, y, ext: true },
      alg,
      false,
      ["verify"],
    );
    const msg = new TextEncoder().encode("vapid-pair-check");
    const sig = await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      privKey,
      msg,
    );
    return await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      pubKey,
      sig,
      msg,
    );
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  // ---- Diagnostics: FCM project/API check (service-role callers only) ----
  if (req.method === "POST") {
    let mode: string | null = null;
    try {
      const cloned = await req.clone().json();
      mode = typeof cloned?.mode === "string" ? cloned.mode : null;
    } catch {
      /* no body — normal cron invocation */
    }
    if (mode === "fcm_config" || mode === "vapid_config") {
      const auth = req.headers.get("Authorization") ?? "";
      if (auth.replace(/^Bearer\s+/i, "") !== getServiceRoleKey()) {
        return json({ ok: false, error: "Unauthorized" }, 401);
      }
      if (mode === "fcm_config") {
        return json({ ok: true, fcm: await describeFcmConfig() });
      }
      const priv = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
      const vite = Deno.env.get("VITE_VAPID_PUBLIC_KEY") ?? "";
      const legacy = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
      return json({
        ok: true,
        vapid: {
          hasPrivate: !!priv,
          hasVitePublic: !!vite,
          hasLegacyPublic: !!legacy,
          viteEqualsLegacy: !!vite && vite === legacy,
          privatePairsVite: priv && vite ? await vapidPairs(vite, priv) : false,
          privatePairsLegacy:
            priv && legacy ? await vapidPairs(legacy, priv) : false,
        },
      });
    }
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    getServiceRoleKey(),
  );

  const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY");
  const vitePublic = Deno.env.get("VITE_VAPID_PUBLIC_KEY");
  const legacyPublic = Deno.env.get("VAPID_PUBLIC_KEY");
  // Prefer the client-facing key, but fall back to the legacy secret when the
  // private key actually pairs with that one — a half-finished key rotation
  // otherwise 403s every single web push.
  let vapidPublic = vitePublic;
  if (vapidPrivate && vitePublic && legacyPublic && vitePublic !== legacyPublic) {
    if (
      !(await vapidPairs(vitePublic, vapidPrivate)) &&
      (await vapidPairs(legacyPublic, vapidPrivate))
    ) {
      console.warn(
        `[${FUNCTION_NAME}] VAPID mismatch: signing with legacy VAPID_PUBLIC_KEY`,
      );
      vapidPublic = legacyPublic;
    }
  }
  if (vapidPublic && vapidPrivate) {
    webpush.setVapidDetails(
      "mailto:support@jet-around.com",
      vapidPublic,
      vapidPrivate,
    );
  }

  try {
    const { data: jobs, error: claimErr } = await supabase.rpc(
      "claim_notification_batch",
      {
        _limit: BATCH_SIZE,
      },
    );
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
          // "All users": every signed-up user. Notification preferences and
          // quiet hours are applied further down, so opt-outs are respected
          // without excluding users who simply have no device registered yet.
          const { data: allProfiles } = await supabase
            .from("profiles")
            .select("id");
          userIds = (allProfiles ?? []).map((p: any) => p.id);
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
        const prefById = new Map(
          (prefRows ?? []).map((p: any) => [p.user_id, p]),
        );

        const { data: settingsRows } = await supabase
          .from("user_notification_settings")
          .select("*")
          .in("user_id", userIds);
        const settingsById = new Map(
          (settingsRows ?? []).map((s: any) => [
            s.user_id,
            s as UserNotificationSettings,
          ]),
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
          const settings: UserNotificationSettings = settingsById.get(uid) ?? {
            user_id: uid,
            ...DEFAULT_SETTINGS,
          };
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
                stats: {
                  reason: "all_opted_out",
                  opted_out: optedOut,
                  deferred,
                },
              })
              .eq("id", job.id);
            results.push({ id: job.id, skipped: "all_opted_out" });
          }
          continue;
        }

        // ---- 3. Fan out -------------------------------------------------
        const { data: subs } = await supabase
          .from("push_notifications")
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
        const nativeAudit: Array<Record<string, unknown>> = [];

        const auditBase = (sub: any) => ({
          queue_id: job.id,
          user_id: sub.user_id,
          subscription_id: sub.id,
          platform: sub.platform ?? "unknown",
          token_tail: tokenTail(sub.endpoint ?? ""),
          category: job.category ?? null,
          event_type: job.event_type ?? null,
          audience: job.audience ?? null,
        });

        await Promise.allSettled(
          (subs ?? []).map(async (sub: any) => {
            const isNative =
              sub.platform === "ios" || sub.platform === "android";
            try {
              if (isNative) {
                const res = await sendFcmV1(
                  sub.endpoint,
                  { title: job.title, body: job.body },
                  data,
                );
                nativeAudit.push({
                  ...auditBase(sub),
                  status: res.ok
                    ? "sent"
                    : res.unregistered
                      ? "unregistered"
                      : "failed",
                  http_status: res.httpStatus ?? null,
                  provider_message_id: res.messageId ?? null,
                  error: res.ok ? null : (res.error ?? "fcm failed").slice(0, 500),
                });
                if (!res.ok) {
                  if (res.unregistered) invalid.push(sub.id);
                  throw new Error(res.error ?? "fcm failed");
                }
                nativeSent++;
              } else {
                if (!vapidPublic || !vapidPrivate)
                  throw new Error("VAPID keys not configured");
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
              // web-push throws WebPushError with statusCode/body; the bare
              // message ("Received unexpected response code") is undiagnosable
              // on its own, so fold the transport detail into the audit row.
              const detail = [
                String(err?.message ?? err),
                err?.statusCode ? `status=${err.statusCode}` : "",
                err?.body ? `body=${String(err.body).slice(0, 200)}` : "",
              ]
                .filter(Boolean)
                .join(" | ");
              if (err?.statusCode === 404 || err?.statusCode === 410)
                invalid.push(sub.id);
              // Native failures thrown before sendFcmV1 returned (e.g. OAuth
              // minting blew up) still need an audit row.
              if (isNative && !nativeAudit.some((a) => a.subscription_id === sub.id)) {
                nativeAudit.push({
                  ...auditBase(sub),
                  status: "failed",
                  error: detail.slice(0, 500),
                });
              }
              deliveries.push({
                queue_id: job.id,
                user_id: sub.user_id,
                subscription_id: sub.id,
                channel: isNative ? "native" : "web",
                status: "failed",
                error: detail.slice(0, 400),
              });
            }
          }),
        );

        if (invalid.length > 0) {
          await supabase
            .from("push_notifications")
            .update({ active: false })
            .in("id", invalid);
        }
        if (deliveries.length > 0) {
          await supabase.from("notification_deliveries").insert(deliveries);
        }
        if (nativeAudit.length > 0) {
          const { error: auditErr } = await supabase
            .from("native_push_audit")
            .insert(nativeAudit);
          if (auditErr) {
            console.error(
              `[${FUNCTION_NAME}] native push audit insert failed:`,
              auditErr.message,
            );
          }
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

        results.push({
          id: job.id,
          web_sent: webSent,
          native_sent: nativeSent,
        });
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
              : new Date(
                  Date.now() + 60_000 * 2 ** ((job.attempts ?? 1) - 1),
                ).toISOString(),
            processed_at: exhausted ? new Date().toISOString() : null,
          })
          .eq("id", job.id);
        results.push({ id: job.id, error: message });
      }
    }

    return json({ ok: true, processed: jobs.length, results });
  } catch (err) {
    console.error(
      `[${FUNCTION_NAME}]`,
      err instanceof Error ? err.message : err,
    );
    return internalError(err);
  }
});
