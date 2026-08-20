/**
 * Unified notification ingress.
 *
 * JET Bridge (merchant portal) and internal triggers POST here. The request is
 * authenticated with an HMAC signature (or the legacy shared secret) and is
 * deduplicated by `idempotency_key`, so retries never fan out twice.
 * Actual delivery happens asynchronously in `notifications-dispatch`.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, logVersion } from "../_shared/cors.ts";
import { ErrorCode } from "../_shared/http.ts";
import { verifyBridgeAuth } from "../_shared/notifications.ts";

const FUNCTION_NAME = "notifications-enqueue";
logVersion(FUNCTION_NAME);

const cors = {
  ...corsHeaders,
  "Access-Control-Allow-Headers":
    corsHeaders["Access-Control-Allow-Headers"] +
    ", x-webhook-secret, jetbridge_webhook_secret, x-jet-signature, x-idempotency-key",
};

interface EnqueueBody {
  idempotency_key?: string;
  event_type: string;
  category?: string;
  title: string;
  body: string;
  source?: string;
  deal_id?: string;
  venue_id?: string;
  venue_name?: string;
  neighborhood_id?: string;
  user_ids?: string[];
  audience?: "favorites" | "users" | "neighborhood" | "all";
  layers?: string;
  url?: string;
  scheduled_at?: string;
  data?: Record<string, string>;
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

/** Standard `{ error, code }` envelope, with this function's CORS headers. */
function jsonError(
  status: number,
  code: string,
  message: string,
  detail?: string,
) {
  return json(
    { success: false, error: message, code, ...(detail ? { detail } : {}) },
    status,
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST")
    return jsonError(405, ErrorCode.METHOD_NOT_ALLOWED, "Method not allowed");

  try {
    const raw = await req.text();
    if (!(await verifyBridgeAuth(req, raw)))
      return jsonError(401, ErrorCode.UNAUTHORIZED, "Unauthorized");

    let payload: EnqueueBody;
    try {
      payload = JSON.parse(raw) as EnqueueBody;
    } catch {
      return jsonError(400, ErrorCode.INVALID_JSON, "Invalid JSON body");
    }

    const errors: string[] = [];
    if (!payload.event_type) errors.push("event_type is required");
    if (!payload.title || payload.title.length > 200)
      errors.push("title is required (<=200 chars)");
    if (!payload.body || payload.body.length > 500)
      errors.push("body is required (<=500 chars)");
    const audience =
      payload.audience ?? (payload.user_ids?.length ? "users" : "favorites");
    if (!["favorites", "users", "neighborhood", "all"].includes(audience)) {
      errors.push("audience must be favorites|users|neighborhood|all");
    }
    if (audience === "users" && !payload.user_ids?.length) {
      errors.push("user_ids required for audience=users");
    }
    if (audience === "neighborhood" && !payload.neighborhood_id) {
      errors.push("neighborhood_id required for audience=neighborhood");
    }
    if (audience === "favorites" && !payload.deal_id && !payload.venue_id) {
      errors.push("deal_id or venue_id required for audience=favorites");
    }
    if (errors.length)
      return jsonError(
        400,
        ErrorCode.INVALID_INPUT,
        errors.join("; "),
        errors.join("; "),
      );

    const idempotencyKey =
      payload.idempotency_key ??
      req.headers.get("x-idempotency-key") ??
      `${payload.event_type}:${payload.deal_id ?? payload.venue_id ?? "na"}:${payload.title}`;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const row = {
      idempotency_key: idempotencyKey,
      source: payload.source ?? "jet_bridge",
      event_type: payload.event_type,
      category: payload.category ?? "deals",
      title: payload.title,
      body: payload.body,
      data: {
        ...(payload.data ?? {}),
        venueName: payload.venue_name ?? "",
        layers: payload.layers ?? "",
        url: payload.url ?? "",
      },
      deal_id: payload.deal_id ?? null,
      venue_id: payload.venue_id ?? null,
      neighborhood_id: payload.neighborhood_id ?? null,
      target_user_ids: payload.user_ids ?? null,
      audience,
      scheduled_at: payload.scheduled_at ?? new Date().toISOString(),
    };

    const { data: inserted, error } = await supabase
      .from("notification_queue")
      .insert(row)
      .select("id, status")
      .maybeSingle();

    if (error) {
      // Duplicate idempotency key → treat as success (already queued).
      if (error.code === "23505") {
        const { data: existing } = await supabase
          .from("notification_queue")
          .select("id, status")
          .eq("idempotency_key", idempotencyKey)
          .maybeSingle();
        return json({
          ok: true,
          duplicate: true,
          id: existing?.id,
          status: existing?.status,
        });
      }
      throw error;
    }

    // Best-effort immediate wake of the dispatcher; cron is the safety net.
    try {
      await supabase.functions.invoke("notifications-dispatch", {
        body: { wake: true },
      });
    } catch (_e) {
      /* cron will pick it up */
    }

    return json(
      { ok: true, id: inserted?.id, status: inserted?.status ?? "pending" },
      202,
    );
  } catch (err) {
    console.error(
      `[${FUNCTION_NAME}]`,
      err instanceof Error ? err.message : err,
    );
    return json({ error: "Internal server error" }, 500);
  }
});
