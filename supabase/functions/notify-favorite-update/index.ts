import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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
        JSON.stringify({
          error: "deal_id or venue_id and event_type required",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
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
    const orClauses: string[] = [];
    if (payload.deal_id) orClauses.push(`deal_id.eq.${payload.deal_id}`);
    if (venueId) orClauses.push(`venue_id.eq.${venueId}`);
    const { data: favs, error: favErr } = await favQuery.or(
      orClauses.join(","),
    );
    if (favErr) throw favErr;

    const userIds = Array.from(
      new Set((favs ?? []).map((f) => f.user_id)),
    ).filter(Boolean);
    if (userIds.length === 0) {
      return new Response(
        JSON.stringify({
          message: "No favorites for this deal/venue",
          sent: 0,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { title, body } = payload.body_override
      ? {
          title: payload.title_override ?? dealTitle,
          body: payload.body_override,
        }
      : buildMessage(payload.event_type, dealTitle, venueName, expiresAt);

    const url = payload.deal_id
      ? `/?deal=${encodeURIComponent(payload.deal_id)}`
      : venueId
        ? `/?venue=${encodeURIComponent(venueId)}`
        : "/favorites";

    // Push delivery is handled by the unified notification bus. Enqueue one
    // job targeting the favoriting users; the dispatcher applies quiet hours,
    // category opt-outs, and writes notification_logs + delivery receipts.
    let queuedId: string | null = null;
    let queueDuplicate = false;
    {
      const idempotencyKey = `fav:${payload.event_type}:${payload.deal_id ?? venueId}:${title}`;
      const { data: queued, error: queueErr } = await supabase
        .from("notification_queue")
        .insert({
          idempotency_key: idempotencyKey,
          source: "favorites",
          event_type:
            payload.event_type === "ending_soon"
              ? "ending_soon"
              : "favorite_update",
          category: "favorites",
          title,
          body,
          data: { venueName, url },
          deal_id: payload.deal_id ?? null,
          venue_id: venueId,
          target_user_ids: userIds,
          audience: "users",
        })
        .select("id")
        .maybeSingle();

      if (queueErr) {
        if (queueErr.code === "23505") queueDuplicate = true;
        else console.error("queue insert failed:", queueErr.message);
      } else {
        queuedId = queued?.id ?? null;
        try {
          await supabase.functions.invoke("notifications-dispatch", {
            body: { wake: true },
          });
        } catch (_e) {
          /* cron picks it up */
        }
      }
    }

    // Send transactional emails to users who have email notifications enabled.
    // This is legitimate transactional mail — each recipient personally
    // favorited this specific deal/venue and expects updates about it.
    let emailsSent = 0;
    try {
      const { data: prefs } = await supabase
        .from("user_preferences")
        .select("user_id, email_notifications_enabled")
        .in("user_id", userIds)
        .eq("email_notifications_enabled", true);

      const emailUserIds = (prefs ?? []).map((p) => p.user_id);
      if (emailUserIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, display_name")
          .in("id", emailUserIds);
        const nameById = new Map(
          (profs ?? []).map((p) => [p.id, p.display_name]),
        );

        // Fetch auth emails via admin API
        const { data: usersList } = await supabase.auth.admin.listUsers({
          page: 1,
          perPage: 1000,
        });
        const emailById = new Map(
          (usersList?.users ?? [])
            .filter((u) => emailUserIds.includes(u.id) && !!u.email)
            .map((u) => [u.id, u.email as string]),
        );

        const ctaUrl = `https://www.jet-around.com${url}`;
        const idBase = payload.deal_id ?? venueId ?? "fav";

        await Promise.all(
          emailUserIds.map(async (uid) => {
            const recipient = emailById.get(uid);
            if (!recipient) return;
            try {
              const { error: sendErr } = await supabase.functions.invoke(
                "send-transactional-email",
                {
                  body: {
                    templateName: "favorite-update",
                    recipientEmail: recipient,
                    idempotencyKey: `fav-${payload.event_type}-${idBase}-${uid}`,
                    templateData: {
                      name: nameById.get(uid) ?? undefined,
                      venueName,
                      dealTitle,
                      eventType: payload.event_type,
                      ctaUrl,
                      expiresAt,
                    },
                  },
                },
              );
              if (!sendErr) emailsSent++;
              else console.error("email send error:", uid, sendErr.message);
            } catch (e: any) {
              console.error("email invoke error:", uid, e?.message);
            }
          }),
        );
      }
    } catch (e: any) {
      console.error("favorite-update email dispatch failed:", e?.message);
    }

    // notification_logs rows are written by notifications-dispatch so the
    // in-app Alerts feed matches what was actually delivered.
    return new Response(
      JSON.stringify({
        ok: true,
        favorited_users: userIds.length,
        queued_id: queuedId,
        queue_duplicate: queueDuplicate,
        emails_sent: emailsSent,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
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
