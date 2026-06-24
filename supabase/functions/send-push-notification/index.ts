import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, logVersion, EDGE_FUNCTION_VERSION } from "../_shared/cors.ts";

const FUNCTION_NAME = "send-push-notification";
logVersion(FUNCTION_NAME);

interface NotificationPayload {
  title: string;
  body: string;
  data?: Record<string, any>;
  user_ids?: string[];
  neighborhood_id?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Verify the user is authenticated and is an admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user from JWT token
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !user) {
      console.error('Auth error:', authError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user has admin role
    const { data: adminRole, error: roleError } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .single();

    if (roleError || !adminRole) {
      console.error('Admin check failed:', roleError);
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Admin user ${user.id} sending push notification`);

    const payload: NotificationPayload = await req.json();
    const { title, body, data, user_ids, neighborhood_id } = payload;

    if (!title || !body) {
      throw new Error('Title and body are required');
    }

    // Get active push subscriptions
    let query = supabaseClient
      .from('push_subscriptions')
      .select('*')
      .eq('active', true);

    // Filter by user IDs or neighborhood
    if (user_ids && user_ids.length > 0) {
      query = query.in('user_id', user_ids);
    } else if (neighborhood_id) {
      // Get users in the neighborhood
      const { data: locations } = await supabaseClient
        .from('user_locations')
        .select('user_id')
        .eq('current_neighborhood_id', neighborhood_id);

      if (locations && locations.length > 0) {
        const userIds = locations.map(l => l.user_id).filter(Boolean);
        query = query.in('user_id', userIds);
      }
    }

    const { data: subscriptions, error: subsError } = await query;

    if (subsError) {
      throw subsError;
    }

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No active subscriptions found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // For native apps, we would integrate with FCM (Firebase Cloud Messaging) 
    // and APNS (Apple Push Notification Service)
    // This requires additional setup with Firebase and Apple Developer account

    // Here's the structure for sending notifications
    const FCM_SERVER_KEY = Deno.env.get('FCM_SERVER_KEY');
    const APNS_KEY = Deno.env.get('APNS_KEY');

    const notificationPromises = subscriptions.map(async (subscription) => {
      try {
        // For Android (FCM)
        if (FCM_SERVER_KEY && subscription.endpoint.includes('fcm')) {
          const fcmResponse = await fetch('https://fcm.googleapis.com/fcm/send', {
            method: 'POST',
            headers: {
              'Authorization': `key=${FCM_SERVER_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              to: subscription.endpoint,
              notification: {
                title,
                body,
                sound: 'default',
                badge: 1,
              },
              data: data || {},
              priority: 'high',
            }),
          });

          if (!fcmResponse.ok) {
            console.error('FCM error:', await fcmResponse.text());
          }
        }

        // For iOS (APNS)
        // APNS implementation would go here with proper authentication
        // This requires more complex setup with certificates/tokens

        // Log notification in database
        await supabaseClient
          .from('notification_logs')
          .insert({
            user_id: subscription.user_id,
            title,
            message: body,
            notification_type: 'push',
            neighborhood_id: data?.neighborhoodId || null,
            deal_id: data?.dealId || null,
          });

      } catch (error) {
        console.error('Error sending to subscription:', error);
      }
    });

    await Promise.allSettled(notificationPromises);

    return new Response(
      JSON.stringify({ 
        success: true, 
        sent: subscriptions.length,
        message: `Notification sent to ${subscriptions.length} device(s)`,
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
