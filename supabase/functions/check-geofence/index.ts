import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, logVersion, EDGE_FUNCTION_VERSION } from "../_shared/cors.ts";

const FUNCTION_NAME = "check-geofence";
logVersion(FUNCTION_NAME);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // User client for auth
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // Service role client for inserting notifications
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Get user from JWT
    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser();

    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { latitude, longitude, accuracy } = await req.json();

    // Validate coordinate inputs
    if (typeof latitude !== 'number' || isNaN(latitude) || latitude < -90 || latitude > 90) {
      console.error('Invalid latitude:', latitude);
      return new Response(
        JSON.stringify({ error: 'Invalid latitude. Must be a number between -90 and 90.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (typeof longitude !== 'number' || isNaN(longitude) || longitude < -180 || longitude > 180) {
      console.error('Invalid longitude:', longitude);
      return new Response(
        JSON.stringify({ error: 'Invalid longitude. Must be a number between -180 and 180.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (accuracy !== undefined && accuracy !== null) {
      if (typeof accuracy !== 'number' || isNaN(accuracy) || accuracy < 0 || accuracy > 100000) {
        console.error('Invalid accuracy:', accuracy);
        return new Response(
          JSON.stringify({ error: 'Invalid accuracy. Must be a positive number up to 100000 meters.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    console.log('Checking geofence for user:', user.id, 'at', latitude, longitude);

    // Get all active neighborhoods
    const { data: neighborhoods, error: neighborhoodsError } = await supabaseClient
      .from('neighborhoods')
      .select('*')
      .eq('active', true);

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

    console.log('Current neighborhood:', currentNeighborhood?.name || 'none');

    // Get user's last known location
    const { data: lastLocation } = await supabaseClient
      .from('user_locations')
      .select('current_neighborhood_id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Save current location
    await supabaseClient.from('user_locations').insert({
      user_id: user.id,
      latitude,
      longitude,
      accuracy,
      current_neighborhood_id: currentNeighborhood?.id || null,
    });

    // Check if user entered a new neighborhood
    const enteredNewNeighborhood = 
      currentNeighborhood && 
      (!lastLocation || lastLocation.current_neighborhood_id !== currentNeighborhood.id);

    let dealsToNotify = [];
    let notificationsSent = 0;

    if (enteredNewNeighborhood) {
      console.log('User entered new neighborhood:', currentNeighborhood.name);

      // Get active deals in this neighborhood
      const now = new Date().toISOString();
      const dayOfWeek = new Date().getDay();

      const { data: deals, error: dealsError } = await supabaseClient
        .from('deals')
        .select('*')
        .eq('neighborhood_id', currentNeighborhood.id)
        .eq('active', true)
        .lte('starts_at', now)
        .gte('expires_at', now)
        .contains('active_days', [dayOfWeek]);

      if (!dealsError && deals && deals.length > 0) {
        console.log('Found', deals.length, 'active deals');
        dealsToNotify = deals;

        // Log notifications and send push (don't send duplicates within last hour)
        for (const deal of deals) {
          // Check if we already sent this notification recently
          const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
          const { data: recentNotif } = await supabaseAdmin
            .from('notification_logs')
            .select('id')
            .eq('user_id', user.id)
            .eq('deal_id', deal.id)
            .gte('sent_at', oneHourAgo)
            .maybeSingle();

          if (!recentNotif) {
            // Insert notification log using admin client (bypasses RLS)
            const { error: insertError } = await supabaseAdmin.from('notification_logs').insert({
              user_id: user.id,
              deal_id: deal.id,
              neighborhood_id: currentNeighborhood.id,
              notification_type: 'geofence_deal',
              title: `🔥 ${deal.title}`,
              message: `${deal.description} at ${deal.venue_name}`,
            });

            if (insertError) {
              console.error('Error inserting notification:', insertError);
            } else {
              notificationsSent++;
              console.log('Notification logged for deal:', deal.id);
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
          await supabaseAdmin.from('notification_logs').insert({
            user_id: user.id,
            neighborhood_id: currentNeighborhood.id,
            notification_type: 'neighborhood_entry',
            title: `📍 Welcome to ${currentNeighborhood.name}!`,
            message: `${notificationsSent} active ${notificationsSent === 1 ? 'deal' : 'deals'} nearby`,
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
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in check-geofence:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

// Ray casting algorithm for point-in-polygon test
function isPointInPolygon(lat: number, lng: number, polygon: number[][]): boolean {
  if (!polygon || polygon.length < 3) return false;
  
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];

    const intersect =
      yi > lng !== yj > lng &&
      lat < ((xj - xi) * (lng - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// Send push notification to a specific user's devices
async function sendPushToUser(
  supabase: any, 
  userId: string, 
  notification: { title: string; body: string; data?: Record<string, any> }
) {
  try {
    // Get user's active push subscriptions
    const { data: subscriptions, error } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', userId)
      .eq('active', true);

    if (error || !subscriptions || subscriptions.length === 0) {
      console.log('No active push subscriptions for user:', userId);
      return;
    }

    console.log(`Sending push to ${subscriptions.length} device(s) for user ${userId}`);

    const FCM_SERVER_KEY = Deno.env.get('FCM_SERVER_KEY');

    for (const subscription of subscriptions) {
      try {
        // For FCM (Android)
        if (FCM_SERVER_KEY && subscription.endpoint) {
          const response = await fetch('https://fcm.googleapis.com/fcm/send', {
            method: 'POST',
            headers: {
              'Authorization': `key=${FCM_SERVER_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              to: subscription.endpoint,
              notification: {
                title: notification.title,
                body: notification.body,
                sound: 'default',
                badge: 1,
                click_action: 'OPEN_DEAL',
              },
              data: notification.data || {},
              priority: 'high',
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error('FCM error:', errorText);
            
            // If token is invalid, mark subscription as inactive
            if (response.status === 404 || errorText.includes('NotRegistered')) {
              await supabase
                .from('push_subscriptions')
                .update({ active: false })
                .eq('id', subscription.id);
              console.log('Marked invalid subscription as inactive:', subscription.id);
            }
          } else {
            console.log('Push sent successfully to:', subscription.id);
          }
        }
      } catch (pushError) {
        console.error('Error sending push to subscription:', pushError);
      }
    }
  } catch (error) {
    console.error('Error in sendPushToUser:', error);
  }
}
