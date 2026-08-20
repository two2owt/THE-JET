/**
 * JET Bridge compatibility shim.
 *
 * The merchant portal still POSTs here; delivery is now handled by the
 * unified notification bus, so this function validates the payload and hands
 * it to `notification_queue` (deduplicated by idempotency key).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, logVersion } from "../_shared/cors.ts";
import {
  internalError,
  invalidInput,
  invalidJson,
  unauthorized,
} from "../_shared/http.ts";
import { verifyBridgeAuth } from "../_shared/notifications.ts";

const FUNCTION_NAME = "merchant-send-notification";
logVersion(FUNCTION_NAME);

// CORS: allow the custom secret header names the merchant portal sends
const cors = {
  ...corsHeaders,
  "Access-Control-Allow-Headers":
    corsHeaders["Access-Control-Allow-Headers"] +
    ", x-webhook-secret, jetbridge_webhook_secret, x-jet-signature, x-idempotency-key",
};

interface MerchantNotificationPayload {
  title: string;
  body: string;
  venue_name?: string;
  venue_id?: string;
  deal_id?: string;
  merchant_id?: string;
  neighborhood_id?: string;
  url?: string;
  /** Canonical layer string (e.g. "density,paths") to restore heatmap state on tap. */
  layers?: string;
  idempotency_key?: string;
  category?: string;
  event_type?: string;
  /** Explicit audience override; defaults below. */
  audience?: "favorites" | "neighborhood" | "all";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: cors });
  }

  try {
    const raw = await req.text();
    if (!(await verifyBridgeAuth(req, raw))) {
      return unauthorized();
    }

    let payload: MerchantNotificationPayload;
    try {
      payload = JSON.parse(raw) as MerchantNotificationPayload;
    } catch {
      return invalidJson();
    }
    if (!payload?.title || !payload?.body) {
      return invalidInput("title and body are required");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Only follow-up events about an existing deal should target favoriters.
    // A brand-new deal has no favoriters yet, so it must broadcast.
    const FAVORITE_EVENTS = new Set([
      "favorite_update",
      "updated",
      "ending_soon",
      "activated",
    ]);
    const eventType = payload.event_type ?? "merchant_push";
    const requested = payload.audience;
    const audience =
      requested && ["favorites", "neighborhood", "all"].includes(requested)
        ? requested
        : payload.neighborhood_id
          ? "neighborhood"
          : FAVORITE_EVENTS.has(eventType) &&
              (payload.deal_id || payload.venue_id)
            ? "favorites"
            : "all";

    const idempotencyKey =
      payload.idempotency_key ??
      req.headers.get("x-idempotency-key") ??
      `merchant:${payload.deal_id ?? payload.venue_id ?? "broadcast"}:${payload.title}:${payload.body}`;

    const row = {
      idempotency_key: idempotencyKey,
      source: "jet_bridge",
      event_type: eventType,
      category: payload.category ?? "deals",
      title: payload.title,
      body: payload.body,
      data: {
        venueName: payload.venue_name ?? "",
        layers: payload.layers ?? "",
        url: payload.url ?? "",
        merchantId: payload.merchant_id ?? "",
      },
      deal_id: payload.deal_id ?? null,
      venue_id: payload.venue_id ?? null,
      neighborhood_id: payload.neighborhood_id ?? null,
      audience,
    };

    const { data: inserted, error } = await supabase
      .from("notification_queue")
      .insert(row)
      .select("id")
      .maybeSingle();

    if (error && error.code !== "23505") throw error;

    if (!error) {
      try {
        await supabase.functions.invoke("notifications-dispatch", {
          body: { wake: true },
        });
      } catch (_e) {
        /* cron picks it up */
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        queued: !error,
        duplicate: !!error,
        id: inserted?.id ?? null,
      }),
      { status: 202, headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[${FUNCTION_NAME}] error:`, message);
    return internalError(err);
  }
});
