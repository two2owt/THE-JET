import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "https://esm.sh/web-push@3.6.7";
import { corsHeaders, logVersion, EDGE_FUNCTION_VERSION } from "../_shared/cors.ts";

const FUNCTION_NAME = "send-web-push";
logVersion(FUNCTION_NAME);

interface WebPushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: {
    dealId?: string;
    venueId?: string;
    venueName?: string;
    url?: string;
  };
  user_ids?: string[];
  neighborhood_id?: string;
}

interface PushSubscription {
  endpoint: string;
  p256dh_key: string;
  auth_key: string;
}

async function sendVapidPushNotification(
  subscription: PushSubscription, 
  payload: WebPushPayload,
  vapidPublicKey: string,
  vapidPrivateKey: string
): Promise<boolean> {
  const pushSubscription = {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: subscription.p256dh_key,
      auth: subscription.auth_key,
    },
  };

  const notificationPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon || "/pwa-192x192.png",
    badge: payload.badge || "/pwa-192x192.png",
    tag: payload.tag || `jet-${Date.now()}`,
    data: {
      dealId: payload.data?.dealId || "",
      venueId: payload.data?.venueId || "",
      venueName: payload.data?.venueName || "",
      url: payload.data?.url || "https://jet-around.com",
    },
  });

  try {
    webpush.setVapidDetails(
      "mailto:support@jet-around.com",
      vapidPublicKey,
      vapidPrivateKey
    );

    await webpush.sendNotification(pushSubscription, notificationPayload);
    console.log("VAPID push notification sent successfully");
    return true;
  } catch (error: any) {
    console.error("VAPID push error:", error.message || error);
    
    // Check for expired/invalid subscriptions
    if (error.statusCode === 404 || error.statusCode === 410) {
      console.log("Subscription is no longer valid");
      return false;
    }
    
    throw error;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const vapidPublicKey = Deno.env.get("VITE_VAPID_PUBLIC_KEY");
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");

    if (!vapidPublicKey || !vapidPrivateKey) {
      console.error("VAPID keys not configured");
      return new Response(
        JSON.stringify({ error: "Push notification service not configured - VAPID keys missing" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify admin access
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check admin role
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .single();

    if (!roleData) {
      return new Response(
        JSON.stringify({ error: "Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const payload: WebPushPayload = await req.json();
    console.log("Processing web push request:", JSON.stringify(payload));

    // Get subscriptions based on targeting
    let query = supabase
      .from("push_subscriptions")
      .select("*")
      .eq("active", true);

    if (payload.user_ids && payload.user_ids.length > 0) {
      query = query.in("user_id", payload.user_ids);
    } else if (payload.neighborhood_id) {
      // Get users in the neighborhood
      const { data: locationData } = await supabase
        .from("user_locations")
        .select("user_id")
        .eq("current_neighborhood_id", payload.neighborhood_id);

      if (locationData && locationData.length > 0) {
        const userIds = locationData.map((l) => l.user_id);
        query = query.in("user_id", userIds);
      }
    }

    const { data: subscriptions, error: subError } = await query;

    if (subError) {
      throw new Error(`Failed to fetch subscriptions: ${subError.message}`);
    }

    if (!subscriptions || subscriptions.length === 0) {
      console.log("No active subscriptions found");
      return new Response(
        JSON.stringify({ message: "No active subscriptions found", sent: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${subscriptions.length} active subscriptions`);

    let sentCount = 0;
    const errors: string[] = [];
    const invalidSubscriptions: string[] = [];

    // Send to each subscription via VAPID web push
    for (const sub of subscriptions) {
      try {
        const success = await sendVapidPushNotification(
          sub, 
          payload, 
          vapidPublicKey, 
          vapidPrivateKey
        );

        if (success) {
          // Log notification to database
          await supabase.from("notification_logs").insert({
            user_id: sub.user_id,
            title: payload.title,
            message: payload.body,
            notification_type: "web_push",
            deal_id: payload.data?.dealId || null,
            neighborhood_id: payload.neighborhood_id || null,
          });
          sentCount++;
          console.log(`Web push sent successfully to user: ${sub.user_id}`);
        } else {
          // Mark subscription as inactive if token is invalid
          invalidSubscriptions.push(sub.id);
          errors.push(`Failed to send to ${sub.user_id}: Invalid or expired subscription`);
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        errors.push(`Failed to send to ${sub.user_id}: ${errorMessage}`);
        console.error(`Error sending to ${sub.user_id}:`, errorMessage);
      }
    }

    // Mark invalid subscriptions as inactive
    if (invalidSubscriptions.length > 0) {
      await supabase
        .from("push_subscriptions")
        .update({ active: false })
        .in("id", invalidSubscriptions);
      console.log(`Marked ${invalidSubscriptions.length} subscriptions as inactive`);
    }

    return new Response(
      JSON.stringify({
        message: `Notifications processed`,
        sent: sentCount,
        total: subscriptions.length,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("Error in send-web-push:", err);
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
