/**
 * Open-receipt sink. The web service worker and native tap handler call this
 * when a user opens a push, closing the loop for merchant-side analytics.
 * Public (no JWT) — the notification id is an unguessable UUID and the only
 * effect is marking that delivery as opened.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, logVersion } from "../_shared/cors.ts";

const FUNCTION_NAME = "notifications-receipt";
logVersion(FUNCTION_NAME);

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const notificationId = String(body?.notificationId ?? "");
    if (!UUID_RE.test(notificationId))
      return json({ error: "invalid notificationId" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { error } = await supabase
      .from("notification_deliveries")
      .update({ status: "opened", opened_at: new Date().toISOString() })
      .eq("queue_id", notificationId)
      .eq("status", "sent");
    if (error) throw error;

    return json({ ok: true });
  } catch (err) {
    console.error(
      `[${FUNCTION_NAME}]`,
      err instanceof Error ? err.message : err,
    );
    return json({ error: "Internal server error" }, 500);
  }
});
