import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "https://esm.sh/web-push@3.6.7";
import { corsHeaders, logVersion } from "../_shared/cors.ts";

const FUNCTION_NAME = "merchant-send-notification";
logVersion(FUNCTION_NAME);

// CORS: allow the custom secret header names the merchant portal sends
const cors = {
  ...corsHeaders,
  "Access-Control-Allow-Headers":
    corsHeaders["Access-Control-Allow-Headers"] +
    ", x-webhook-secret, jetbridge_webhook_secret",
};

interface MerchantNotificationPayload {
  title: string;
  body: string;
  venue_name?: string;
  deal_id?: string;
  merchant_id?: string;
  neighborhood_id?: string;
  url?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: cors });
  }

  try {
    // Webhook auth — accept either header name (JET Bridge currently sends
    // a non-standard "JETBRIDGE_WEBHOOK_SECRET" header).
    const expected = Deno.env.get("JETBRIDGE_WEBHOOK_SECRET");
    const provided =
      req.headers.get("x-webhook-secret") ??
      req.headers.get("jetbridge_webhook_secret") ??
      req.headers.get("jetbridge-webhook-secret");

    if (!expected || provided !== expected) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const vapidPublicKey = Deno.env.get("VITE_VAPID_PUBLIC_KEY");
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
    if (!vapidPublicKey || !vapidPrivateKey) {
      return new Response(
        JSON.stringify({ error: "VAPID keys not configured" }),
        { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    const payload = (await req.json()) as MerchantNotificationPayload;
    if (!payload?.title || !payload?.body) {
      return new Response(
        JSON.stringify({ error: "title and body are required" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let query = supabase
      .from("push_subscriptions")
      .select("id, user_id, endpoint, p256dh_key, auth_key")
      .eq("active", true);

    if (payload.neighborhood_id) {
      const { data: locs } = await supabase
        .from("user_locations")
        .select("user_id")
        .eq("current_neighborhood_id", payload.neighborhood_id);
      const userIds = (locs ?? []).map((l) => l.user_id).filter(Boolean);
      if (userIds.length === 0) {
        return new Response(
          JSON.stringify({ message: "No users in neighborhood", sent: 0 }),
          { status: 200, headers: { ...cors, "Content-Type": "application/json" } }
        );
      }
      query = query.in("user_id", userIds);
    }

    const { data: subs, error: subErr } = await query;
    if (subErr) throw subErr;
    if (!subs || subs.length === 0) {
      return new Response(
        JSON.stringify({ message: "No active subscriptions", sent: 0 }),
        { status: 200, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    webpush.setVapidDetails(
      "mailto:support@jet-around.com",
      vapidPublicKey,
      vapidPrivateKey
    );

    const notifBody = JSON.stringify({
      title: payload.title,
      body: payload.body,
      icon: "/pwa-192x192.png",
      badge: "/pwa-192x192.png",
      tag: payload.deal_id ? `deal-${payload.deal_id}` : `jet-${Date.now()}`,
      data: {
        dealId: payload.deal_id ?? "",
        venueName: payload.venue_name ?? "",
        url:
          payload.url ??
          (payload.deal_id
            ? `https://jet-around.com/?deal=${payload.deal_id}`
            : "https://jet-around.com"),
      },
    });

    let sent = 0;
    const invalid: string[] = [];

    await Promise.allSettled(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh_key, auth: sub.auth_key },
            },
            notifBody
          );
          sent++;
          await supabase.from("notification_logs").insert({
            user_id: sub.user_id,
            title: payload.title,
            message: payload.body,
            notification_type: "web_push",
            deal_id: payload.deal_id ?? null,
            neighborhood_id: payload.neighborhood_id ?? null,
          });
        } catch (err: any) {
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            invalid.push(sub.id);
          } else {
            console.error("push error:", err?.message ?? err);
          }
        }
      })
    );

    if (invalid.length > 0) {
      await supabase
        .from("push_subscriptions")
        .update({ active: false })
        .in("id", invalid);
    }

    return new Response(
      JSON.stringify({ success: true, sent, total: subs.length, deactivated: invalid.length }),
      { status: 200, headers: { ...cors, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[${FUNCTION_NAME}] error:`, message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});