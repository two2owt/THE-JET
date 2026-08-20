/**
 * Open-receipt sink. The web service worker and native tap handler call this
 * when a user opens a push, closing the loop for merchant-side analytics.
 * Public (no JWT) — the notification id is an unguessable UUID and the only
 * effect is marking that delivery as opened.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, logVersion } from "../_shared/cors.ts";
import {
  ErrorCode,
  errorResponse,
  internalError,
  jsonResponse,
} from "../_shared/http.ts";

const FUNCTION_NAME = "notifications-receipt";
logVersion(FUNCTION_NAME);

const json = jsonResponse;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST")
    return errorResponse(
      405,
      ErrorCode.METHOD_NOT_ALLOWED,
      "Method not allowed",
    );

  try {
    const body = await req.json().catch(() => ({}));
    const notificationId = String(body?.notificationId ?? "");
    if (!UUID_RE.test(notificationId))
      return errorResponse(
        400,
        ErrorCode.INVALID_INPUT,
        "invalid notificationId",
      );

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
    return internalError(err);
  }
});
