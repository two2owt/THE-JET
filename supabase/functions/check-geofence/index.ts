import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders,
  logVersion,
  EDGE_FUNCTION_VERSION,
} from "../_shared/cors.ts";

const FUNCTION_NAME = "check-geofence";
logVersion(FUNCTION_NAME);

class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detail?: string,
  ) {
    super(message);
  }
}

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Consistent client-usable error payload. Never leaks "Internal server error" as the user-facing message. */
const errorResponse = (
  message: string,
  status: number,
  detail?: string,
) =>
  jsonResponse(
    { success: false, error: message, ...(detail ? { detail } : {}) },
    status,
  );

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // User client for auth
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      },
    );

    // Service role client for inserting notifications
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Get user from JWT
    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser();

    if (authError || !user) {
      throw new HttpError("Unauthorized", 401);
    }

    let payload: Record<string, unknown>;
    try {
      payload = await req.json();
    } catch {
      throw new HttpError("Invalid JSON body", 400);
    }
    const { latitude, longitude, accuracy } = (payload ?? {}) as {
      latitude?: unknown;
      longitude?: unknown;
      accuracy?: unknown;
    };

    // Validate coordinate inputs
    if (
      typeof latitude !== "number" ||
      isNaN(latitude) ||
      latitude < -90 ||
      latitude > 90
    ) {
      console.error("Invalid latitude:", latitude);
      return errorResponse(
        "Invalid latitude. Must be a number between -90 and 90.",
        400,
      );
    }

    if (
      typeof longitude !== "number" ||
      isNaN(longitude) ||
      longitude < -180 ||
      longitude > 180
    ) {
      console.error("Invalid longitude:", longitude);
      return errorResponse(
        "Invalid longitude. Must be a number between -180 and 180.",
        400,
      );
    }

    if (accuracy !== undefined && accuracy !== null) {
      if (
        typeof accuracy !== "number" ||
        isNaN(accuracy) ||
        accuracy < 0 ||
        accuracy > 100000
      ) {
        console.error("Invalid accuracy:", accuracy);
        return errorResponse(
          "Invalid accuracy. Must be a positive number up to 100000 meters.",
          400,
        );
      }
    }

    console.log(
      "Checking geofence for user:",
      user.id,
      "at",
      latitude,
      longitude,
    );

    // Get all active neighborhoods
    const { data: neighborhoods, error: neighborhoodsError } =
      await supabaseClient.from("neighborhoods").select("*").eq("active", true);

    if (neighborhoodsError) throw neighborhoodsError;

    // Check if user is inside any neighborhood (using simple bounding box check)
    let currentNeighborhood = null;
    for (const neighborhood of neighborhoods || []) {
      const boundaryPoints = neighborhood.boundary_points as number[][];

      // Simple point-in-polygon check using ray casting
      if (isPointInPolygon(latitude, longitude, boundaryPoints)) {
        currentNeighborhood = neighborhood;
        break;
      }
    }

    console.log("Current neighborhood:", currentNeighborhood?.name || "none");

    // Get user's last known location
    const { data: lastLocation } = await supabaseClient
      .from("user_locations")
      .select("current_neighborhood_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Save current location
    await supabaseClient.from("user_locations").insert({
      user_id: user.id,
      latitude,
      longitude,
      accuracy: (accuracy ?? null) as number | null,
      current_neighborhood_id: currentNeighborhood?.id || null,
    });

    // Check if user entered a new neighborhood
    const enteredNewNeighborhood =
      currentNeighborhood &&
      (!lastLocation ||
        lastLocation.current_neighborhood_id !== currentNeighborhood.id);

    let dealsToNotify = [];
    let notificationsSent = 0;

    if (enteredNewNeighborhood) {
      console.log("User entered new neighborhood:", currentNeighborhood.name);

      // Get active deals in this neighborhood
      const now = new Date().toISOString();
      const dayOfWeek = new Date().getDay();

      const { data: deals, error: dealsError } = await supabaseClient
        .from("deals")
        .select("*")
        .eq("neighborhood_id", currentNeighborhood.id)
        .eq("active", true)
        .lte("starts_at", now)
        .gte("expires_at", now)
        .contains("active_days", [dayOfWeek]);

      if (!dealsError && deals && deals.length > 0) {
        console.log("Found", deals.length, "active deals");
        dealsToNotify = deals;

        // Log notifications and send push (don't send duplicates within last hour)
        for (const deal of deals) {
          // Check if we already sent this notification recently
          const oneHourAgo = new Date(
            Date.now() - 60 * 60 * 1000,
          ).toISOString();
          const { data: recentNotif } = await supabaseAdmin
            .from("notification_logs")
            .select("id")
            .eq("user_id", user.id)
            .eq("deal_id", deal.id)
            .gte("sent_at", oneHourAgo)
            .maybeSingle();

          if (!recentNotif) {
            // Insert notification log using admin client (bypasses RLS)
            const { error: insertError } = await supabaseAdmin
              .from("notification_logs")
              .insert({
                user_id: user.id,
                deal_id: deal.id,
                neighborhood_id: currentNeighborhood.id,
                notification_type: "geofence_deal",
                title: `🔥 ${deal.title}`,
                message: `${deal.description} at ${deal.venue_name}`,
              });

            if (insertError) {
              console.error("Error inserting notification:", insertError);
            } else {
              notificationsSent++;
              console.log("Notification logged for deal:", deal.id);
            }

            // Try to send push notification to user's devices
            await sendPushToUser(supabaseAdmin, user.id, {
              title: `🔥 ${deal.title}`,
              body: `${deal.description} at ${deal.venue_name}`,
              data: {
                dealId: deal.id,
                venueName: deal.venue_name,
                neighborhoodId: currentNeighborhood.id,
              },
            });
          }
        }

        // Send welcome notification for the neighborhood
        if (notificationsSent > 0) {
          await supabaseAdmin.from("notification_logs").insert({
            user_id: user.id,
            neighborhood_id: currentNeighborhood.id,
            notification_type: "neighborhood_entry",
            title: `📍 Welcome to ${currentNeighborhood.name}!`,
            message: `${notificationsSent} active ${notificationsSent === 1 ? "deal" : "deals"} nearby`,
          });
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        current_neighborhood: currentNeighborhood,
        entered_new_neighborhood: enteredNewNeighborhood,
        deals: dealsToNotify,
        notifications_triggered: notificationsSent,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error in check-geofence:", error);
    if (error instanceof HttpError) {
      return errorResponse(error.message, error.status, error.detail);
    }
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";
    return errorResponse("Internal server error", 500, errorMessage);
  }
});

// Ray casting algorithm for point-in-polygon test
function isPointInPolygon(
  lat: number,
  lng: number,
  polygon: number[][],
): boolean {
  if (!polygon || polygon.length < 3) return false;

  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];

    const intersect =
      yi > lng !== yj > lng && lat < ((xj - xi) * (lng - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Queue a push for a specific user through the unified notification bus.
 *
 * The retired Google `fcm/send` endpoint is no longer used: rows land in
 * `notification_queue` and `notifications-dispatch` handles web push, FCM
 * HTTP v1 delivery, quiet hours, category opt-outs, retries and receipts.
 */
async function sendPushToUser(
  supabase: any,
  userId: string,
  notification: { title: string; body: string; data?: Record<string, any> },
) {
  try {
    const data = notification.data ?? {};
    const dealId = data.dealId ? String(data.dealId) : null;
    const idempotencyKey = [
      "geofence_deal",
      userId,
      dealId ?? "na",
      data.neighborhoodId ?? "na",
      new Date().toISOString().slice(0, 13), // hourly dedupe window
    ].join(":");

    const { error } = await supabase.from("notification_queue").insert({
      idempotency_key: idempotencyKey,
      source: "check-geofence",
      event_type: "geofence_deal",
      category: "deals",
      title: notification.title,
      body: notification.body,
      data: {
        venueName: data.venueName ? String(data.venueName) : "",
        neighborhoodId: data.neighborhoodId ? String(data.neighborhoodId) : "",
        layers: "",
        url: dealId
          ? `https://www.jet-around.com/?deal=${encodeURIComponent(dealId)}`
          : "",
      },
      deal_id: dealId,
      neighborhood_id: data.neighborhoodId ?? null,
      target_user_ids: [userId],
      audience: "users",
      scheduled_at: new Date().toISOString(),
    });

    if (error) {
      // 23505 = duplicate idempotency key, already queued for this window.
      if (error.code !== "23505") {
        console.error("Error queueing geofence push:", error.message);
      }
      return;
    }

    // Best-effort dispatcher wake; cron is the safety net.
    try {
      await supabase.functions.invoke("notifications-dispatch", {
        body: { wake: true },
      });
    } catch (_e) {
      /* cron will pick it up */
    }
  } catch (error) {
    console.error("Error in sendPushToUser:", error);
  }
}
