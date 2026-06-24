import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "https://esm.sh/web-push@3.6.7";
import { corsHeaders, logVersion } from "../_shared/cors.ts";

const FUNCTION_NAME = "notify-favorite-update";
logVersion(FUNCTION_NAME);

type EventType = "activated" | "updated" | "ending_soon";

interface RequestPayload {
  deal_id?: string;
  venue_id?: string;
  event_type: EventType;
  // Optional manual fields when called from cron / webhook
  title_override?: string;
  body_override?: string;
}

function buildMessage(
  event: EventType,
  dealTitle: string,
  venueName: string,
  expiresAt: string | null,
): { title: string; body: string } {
  switch (event) {
    case "activated":
      return {
        title: `${venueName} just dropped a deal`,
        body: `${dealTitle} is now live. Tap to view.`,
      };
    case "updated":
      return {
        title: `${venueName} updated a deal you saved`,
        body: `${dealTitle} — tap to see what's new.`,
      };
    case "ending_soon": {
      let suffix = "Don't miss it.";
      if (expiresAt) {
        const mins = Math.max(
          0,
          Math.round((new Date(expiresAt).getTime() - Date.now()) / 60000),
        );
        if (mins > 0 && mins < 180) suffix = `Ends in ${mins} min.`;
      }
      return {
        title: `${dealTitle} ending soon`,
        body: `${venueName} — ${suffix}`,
      };
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify webhook secret (reuses NOTIFY_ADMIN_HOOK_SECRET)
    const authHeader = req.headers.get("Authorization") ?? "";
    const expected = Deno.env.get("NOTIFY_ADMIN_HOOK_SECRET");
    if (!expected || authHeader !== `Bearer ${expected}`) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = (await req.json()) as RequestPayload;
    if (!payload.event_type || (!payload.deal_id && !payload.venue_id)) {
      return new Response(
        JSON.stringify({ error: "deal_id or venue_id and event_type required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Resolve deal + venue context
    let dealRow: any = null;
    if (payload.deal_id) {
      const { data } = await supabase
        .from("deals")
        .select("id, title, venue_id, venue_name, expires_at, active")
        .eq("id", payload.deal_id)
        .maybeSingle();
      dealRow = data;
    }

    const venueId = dealRow?.venue_id ?? payload.venue_id ?? null;
    const dealTitle = payload.title_override ?? dealRow?.title ?? "A new deal";
    const venueName = dealRow?.venue_name ?? "A venue you saved";
    const expiresAt = dealRow?.expires_at ?? null;

    // Find users who favorited this deal OR this venue
    const favQuery = supabase.from("user_favorites").select("user_id");
    let orClauses: string[] = [];
    if (payload.deal_id) orClauses.push(`deal_id.eq.${payload.deal_id}`);
    if (venueId) orClauses.push(`venue_id.eq.${venueId}`);
    const { data: favs, error: favErr } = await favQuery.or(orClauses.join(","));
    if (favErr) throw favErr;

    const userIds = Array.from(new Set((favs ?? []).map((f) => f.user_id))).filter(Boolean);
    if (userIds.length === 0) {
      return new Response(
        JSON.stringify({ message: "No favorites for this deal/venue", sent: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { title, body } = payload.body_override
      ? { title: payload.title_override ?? dealTitle, body: payload.body_override }
      : buildMessage(payload.event_type, dealTitle, venueName, expiresAt);

    const url = payload.deal_id
      ? `/?deal=${encodeURIComponent(payload.deal_id)}`
      : venueId
        ? `/?venue=${encodeURIComponent(venueId)}`
        : "/favorites";

    const tag = `fav-${payload.event_type}-${payload.deal_id ?? venueId}`;

    // Fetch active subs for these users
    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("*")
      .eq("active", true)
      .in("user_id", userIds);

    let webSent = 0;
    let fcmSent = 0;
    const invalidIds: string[] = [];

    const vapidPublic = Deno.env.get("VITE_VAPID_PUBLIC_KEY");
    const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY");
    const fcmKey = Deno.env.get("FCM_SERVER_KEY");

    if (vapidPublic && vapidPrivate) {
      webpush.setVapidDetails(
        "mailto:support@jet-around.com",
        vapidPublic,
        vapidPrivate,
      );
    }

    const notifPayload = JSON.stringify({
      title,
      body,
      icon: "/pwa-192x192.png",
      badge: "/pwa-192x192.png",
      tag,
      data: {
        dealId: payload.deal_id ?? "",
        venueId: venueId ?? "",
        venueName,
        url,
      },
    });

    for (const sub of subs ?? []) {
      const isFcm = sub.endpoint?.includes("fcm.googleapis.com") || sub.endpoint?.startsWith("fcm:");
      try {
        if (isFcm && fcmKey && !sub.p256dh_key) {
          // Native FCM token path
          const res = await fetch("https://fcm.googleapis.com/fcm/send", {
            method: "POST",
            headers: {
              Authorization: `key=${fcmKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              to: sub.endpoint.replace(/^fcm:/, ""),
              notification: { title, body, sound: "default", badge: 1 },
              data: {
                dealId: payload.deal_id ?? "",
                venueId: venueId ?? "",
                venueName,
                url,
              },
              priority: "high",
            }),
          });
          if (res.ok) fcmSent++;
        } else if (vapidPublic && vapidPrivate && sub.p256dh_key && sub.auth_key) {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh_key, auth: sub.auth_key },
            },
            notifPayload,
          );
          webSent++;
        }
      } catch (err: any) {
        console.error("push error:", err?.statusCode, err?.message);
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          invalidIds.push(sub.id);
        }
      }
    }

    if (invalidIds.length > 0) {
      await supabase
        .from("push_subscriptions")
        .update({ active: false })
        .in("id", invalidIds);
    }

    // Log notifications
    if (userIds.length > 0) {
      const logs = userIds.map((uid) => ({
        user_id: uid,
        title,
        message: body,
        notification_type: payload.event_type === "ending_soon" ? "ending_soon" : "favorite_update",
        deal_id: payload.deal_id ?? null,
      }));
      await supabase.from("notification_logs").insert(logs);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        favorited_users: userIds.length,
        web_sent: webSent,
        fcm_sent: fcmSent,
        invalid_marked: invalidIds.length,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("notify-favorite-update error:", msg);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});