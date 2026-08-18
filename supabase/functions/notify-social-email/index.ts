import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type NotificationType = "friend_request" | "friend_accepted" | "new_message";

// Only one message email per conversation per hour, per recipient.
const MESSAGE_THROTTLE_MINUTES = 60;
// Only one friend-request / friend-accepted email per recipient per window.
const SOCIAL_THROTTLE_MINUTES = 10;
// Don't email if the recipient was active in the app within this window.
const RECENT_ACTIVITY_MINUTES = 15;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey)
    return json({ error: "Server configuration error" }, 500);

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return json({ error: "Unauthorized" }, 401);

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const caller = userData?.user;
  if (userError || !caller) return json({ error: "Unauthorized" }, 401);

  let type: NotificationType;
  let recipientUserId: string;
  let conversationId: string | undefined;
  let connectionId: string | undefined;
  let preview: string | undefined;
  try {
    const body = await req.json();
    type = body.type;
    recipientUserId = body.recipientUserId;
    conversationId =
      typeof body.conversationId === "string" ? body.conversationId : undefined;
    connectionId =
      typeof body.connectionId === "string" ? body.connectionId : undefined;
    preview =
      typeof body.preview === "string" ? body.preview.slice(0, 140) : undefined;
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const validTypes: NotificationType[] = [
    "friend_request",
    "friend_accepted",
    "new_message",
  ];
  if (!validTypes.includes(type)) return json({ error: "Invalid type" }, 400);
  if (!recipientUserId || !/^[0-9a-f-]{36}$/i.test(recipientUserId)) {
    return json({ error: "Invalid recipientUserId" }, 400);
  }
  if (recipientUserId === caller.id) return json({ skipped: "self" });

  // ---- Connection verification for social notifications --------------------
  // The caller must actually be party to a real connection in the expected
  // state; otherwise anyone could email any user id fabricated notifications.
  if (type === "friend_request" || type === "friend_accepted") {
    const expectedStatus = type === "friend_request" ? "pending" : "accepted";

    let query = admin
      .from("user_connections")
      .select("id, user_id, friend_id, status")
      .eq("status", expectedStatus)
      .or(
        `and(user_id.eq.${caller.id},friend_id.eq.${recipientUserId}),` +
          `and(user_id.eq.${recipientUserId},friend_id.eq.${caller.id})`,
      )
      .limit(1);

    if (connectionId && /^[0-9a-f-]{36}$/i.test(connectionId)) {
      query = query.eq("id", connectionId);
    }

    const { data: connections } = await query;
    const connection = connections?.[0];
    if (!connection) return json({ error: "No matching connection" }, 403);

    // friend_request must be sent by the requester; friend_accepted by the
    // user who accepted (the original recipient of the request).
    const senderIsRequester = connection.user_id === caller.id;
    if (type === "friend_request" ? !senderIsRequester : senderIsRequester) {
      return json({ error: "No matching connection" }, 403);
    }

    connectionId = connection.id;

    // Per-recipient throttle so these cannot be replayed in a loop.
    const channelKey = `${type}:${connection.id}`;
    const { data: socialThrottle } = await admin
      .from("email_notification_throttle")
      .select("last_sent_at")
      .eq("user_id", recipientUserId)
      .eq("channel_key", channelKey)
      .maybeSingle();

    if (
      socialThrottle?.last_sent_at &&
      Date.now() - new Date(socialThrottle.last_sent_at).getTime() <
        SOCIAL_THROTTLE_MINUTES * 60_000
    ) {
      return json({ skipped: "throttled" });
    }

    await admin.from("email_notification_throttle").upsert(
      {
        user_id: recipientUserId,
        channel_key: channelKey,
        last_sent_at: new Date().toISOString(),
      },
      { onConflict: "user_id,channel_key" },
    );
  }

  // ---- Throttling for direct messages -------------------------------------
  if (type === "new_message") {
    const channelKey = `new-message:${conversationId ?? caller.id}`;

    // Respect the recipient's email notification preference.
    const { data: prefs } = await admin
      .from("user_preferences")
      .select("email_notifications_enabled")
      .eq("user_id", recipientUserId)
      .maybeSingle();
    if (prefs && prefs.email_notifications_enabled === false) {
      return json({ skipped: "email_notifications_disabled" });
    }

    // Skip if the recipient is actively using the app — they'll see the in-app
    // badge / push instead. Real activity (analytics events) is a far better
    // signal than last_sign_in_at, which only moves on a fresh login.
    const activityCutoff = new Date(
      Date.now() - RECENT_ACTIVITY_MINUTES * 60_000,
    ).toISOString();

    const { count: recentEvents } = await admin
      .from("analytics_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", recipientUserId)
      .gte("created_at", activityCutoff);

    if ((recentEvents ?? 0) > 0) return json({ skipped: "recently_active" });

    // Reading messages counts as activity too.
    const { count: recentReads } = await admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", recipientUserId)
      .gte("read_at", activityCutoff);

    if ((recentReads ?? 0) > 0) return json({ skipped: "recently_active" });

    const { data: throttleRow } = await admin
      .from("email_notification_throttle")
      .select("last_sent_at")
      .eq("user_id", recipientUserId)
      .eq("channel_key", channelKey)
      .maybeSingle();

    if (
      throttleRow?.last_sent_at &&
      Date.now() - new Date(throttleRow.last_sent_at).getTime() <
        MESSAGE_THROTTLE_MINUTES * 60_000
    ) {
      return json({ skipped: "throttled" });
    }

    await admin.from("email_notification_throttle").upsert(
      {
        user_id: recipientUserId,
        channel_key: channelKey,
        last_sent_at: new Date().toISOString(),
      },
      { onConflict: "user_id,channel_key" },
    );
  }

  // ---- Resolve recipient + actor -------------------------------------------
  const { data: recipientUser, error: recipientError } =
    await admin.auth.admin.getUserById(recipientUserId);
  const recipientEmail = recipientUser?.user?.email;
  if (recipientError || !recipientEmail)
    return json({ error: "Recipient not found" }, 404);

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, display_name")
    .in("id", [recipientUserId, caller.id]);

  const nameFor = (id: string) =>
    profiles?.find(
      (p: { id: string; display_name: string | null }) => p.id === id,
    )?.display_name ?? undefined;

  const actorName = nameFor(caller.id) ?? "Someone";
  const recipientName = nameFor(recipientUserId);

  const templateName =
    type === "friend_request"
      ? "friend-request"
      : type === "friend_accepted"
        ? "friend-accepted"
        : "new-message";

  const templateData: Record<string, unknown> = { name: recipientName };
  if (type === "friend_request") templateData.senderName = actorName;
  if (type === "friend_accepted") templateData.accepterName = actorName;
  if (type === "new_message") {
    templateData.senderName = actorName;
    templateData.preview = preview;

    // Total unread across every conversation, so the email reflects everything
    // waiting for them — not just this one message.
    const { data: unreadRows } = await admin
      .from("messages")
      .select("conversation_id")
      .eq("recipient_id", recipientUserId)
      .is("read_at", null)
      .limit(500);

    const unreadCount = unreadRows?.length ?? 1;
    const conversationCount = new Set(
      (unreadRows ?? []).map(
        (r: { conversation_id: string }) => r.conversation_id,
      ),
    ).size;

    templateData.unreadCount = Math.max(1, unreadCount);
    templateData.conversationCount = Math.max(1, conversationCount);
  }

  const bucket = Math.floor(Date.now() / (MESSAGE_THROTTLE_MINUTES * 60_000));
  const idempotencyKey =
    type === "new_message"
      ? `new-message-${conversationId ?? caller.id}-${bucket}`
      : // Connection-scoped so a re-sent request (after removal/re-add) is a new
        // email, while duplicate clicks on the same connection stay deduplicated.
        `${templateName}-${connectionId ?? `${caller.id}-${recipientUserId}-${bucket}`}`;

  // Retry the hand-off to the queue a couple of times: a transient 5xx here
  // would otherwise drop the notification entirely (the pgmq retry loop only
  // covers emails that were successfully enqueued).
  const maxAttempts = 3;
  let lastStatus = 0;
  let lastDetails = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let response: Response;
    try {
      response = await fetch(
        `${supabaseUrl}/functions/v1/send-transactional-email`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            templateName,
            recipientEmail,
            idempotencyKey,
            templateData,
          }),
        },
      );
    } catch (err) {
      lastStatus = 0;
      lastDetails = err instanceof Error ? err.message : String(err);
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 300 * attempt));
        continue;
      }
      break;
    }

    if (response.ok) {
      return json({ success: true, templateName, idempotencyKey });
    }

    lastStatus = response.status;
    lastDetails = await response.text();

    // 4xx responses are deterministic (bad template, suppressed recipient) —
    // retrying cannot help.
    if (response.status < 500) break;
    if (attempt < maxAttempts)
      await new Promise((r) => setTimeout(r, 300 * attempt));
  }

  console.error(
    `send-transactional-email failed [${lastStatus}]: ${lastDetails}`,
  );

  // Make the failure visible in the same place successful sends are tracked.
  await admin.from("email_send_log").insert({
    message_id: idempotencyKey,
    template_name: templateName,
    recipient_email: recipientEmail,
    status: "failed",
    error_message:
      `send-transactional-email ${lastStatus}: ${lastDetails}`.slice(0, 500),
    metadata: { source: "notify-social-email", type },
  });

  return json(
    { error: "Email send failed", status: lastStatus, details: lastDetails },
    lastStatus >= 400 ? lastStatus : 502,
  );
});
