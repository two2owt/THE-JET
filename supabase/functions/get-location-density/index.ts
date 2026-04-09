import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, logVersion, EDGE_FUNCTION_VERSION } from "../_shared/cors.ts";

const FUNCTION_NAME = "get-location-density";
logVersion(FUNCTION_NAME);

// Rate limiting: 15 requests per minute per IP
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 15;
const SUSPICIOUS_THRESHOLD = 12; // Log as suspicious when 80% of limit reached
const rateLimitMap = new Map<string, { count: number; resetTime: number; violations: number }>();

function getRateLimitKey(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
         req.headers.get('x-real-ip') || 
         'unknown';
}

function checkRateLimit(ip: string): { allowed: boolean; remaining: number; resetIn: number; count: number; violations: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  
  if (!entry || now >= entry.resetTime) {
    const violations = entry?.violations || 0;
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS, violations });
    return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - 1, resetIn: RATE_LIMIT_WINDOW_MS, count: 1, violations };
  }
  
  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    entry.violations++;
    return { allowed: false, remaining: 0, resetIn: entry.resetTime - now, count: entry.count, violations: entry.violations };
  }
  
  entry.count++;
  return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - entry.count, resetIn: entry.resetTime - now, count: entry.count, violations: entry.violations };
}

// Security audit logging
async function logSecurityEvent(
  eventType: string,
  clientIp: string,
  userAgent: string | null,
  requestCount: number,
  details: Record<string, unknown>
) {
  try {
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    
    await serviceClient.from('security_audit_logs').insert({
      event_type: eventType,
      endpoint: 'get-location-density',
      client_ip: clientIp,
      user_agent: userAgent,
      request_count: requestCount,
      time_window_seconds: Math.round(RATE_LIMIT_WINDOW_MS / 1000),
      details
    });
    
    console.log(`[SECURITY AUDIT] ${eventType} logged for IP: ${clientIp}`);
  } catch (error) {
    console.error('[SECURITY AUDIT] Failed to log event:', error);
  }
}

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap.entries()) {
    if (now >= entry.resetTime) {
      rateLimitMap.delete(ip);
    }
  }
}, 60000);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Check rate limit
  const clientIp = getRateLimitKey(req);
  const userAgent = req.headers.get('user-agent');
  const rateLimit = checkRateLimit(clientIp);
  
  const rateLimitHeaders = {
    ...corsHeaders,
    'X-RateLimit-Limit': RATE_LIMIT_MAX_REQUESTS.toString(),
    'X-RateLimit-Remaining': rateLimit.remaining.toString(),
    'X-RateLimit-Reset': Math.ceil(rateLimit.resetIn / 1000).toString(),
  };

  // Log rate limit exceeded
  if (!rateLimit.allowed) {
    console.warn(`Rate limit exceeded for IP: ${clientIp}`);
    
    // Log security event
    await logSecurityEvent('rate_limit_exceeded', clientIp, userAgent, rateLimit.count, {
      violations_count: rateLimit.violations,
      reset_in_seconds: Math.ceil(rateLimit.resetIn / 1000)
    });
    
    return new Response(
      JSON.stringify({ error: 'Too many requests. Please try again later.' }),
      {
        status: 429,
        headers: { ...rateLimitHeaders, 'Content-Type': 'application/json', 'Retry-After': Math.ceil(rateLimit.resetIn / 1000).toString() },
      }
    );
  }
  
  // Log suspicious pattern (approaching rate limit)
  if (rateLimit.count >= SUSPICIOUS_THRESHOLD && rateLimit.count === SUSPICIOUS_THRESHOLD) {
    await logSecurityEvent('suspicious_pattern', clientIp, userAgent, rateLimit.count, {
      pattern: 'high_request_frequency',
      threshold_percentage: Math.round((rateLimit.count / RATE_LIMIT_MAX_REQUESTS) * 100),
      remaining_requests: rateLimit.remaining
    });
  }
  
  // Log repeated violators
  if (rateLimit.violations >= 3 && rateLimit.count === 1) {
    await logSecurityEvent('repeated_violator', clientIp, userAgent, rateLimit.count, {
      total_violations: rateLimit.violations,
      pattern: 'persistent_abuse'
    });
  }

  try {
    // Use service role client to aggregate ALL users' location data
    // This is safe as the function only returns aggregated density data, not individual locations
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const url = new URL(req.url);
    
    // Read filters from URL params or request body
    let timeFilter = url.searchParams.get('time_filter') || 'all';
    let hourOfDay = url.searchParams.get('hour_of_day');
    let dayOfWeek = url.searchParams.get('day_of_week');
    
    // Also support POST body for filters (supabase.functions.invoke sends body)
    if (req.method === 'POST') {
      try {
        const body = await req.json();
        if (body.time_filter) timeFilter = body.time_filter;
        if (body.hour_of_day !== undefined) hourOfDay = String(body.hour_of_day);
        if (body.day_of_week !== undefined) dayOfWeek = String(body.day_of_week);
      } catch (_) {
        // No body or invalid JSON, use URL params
      }
    }

    console.log('Fetching location density with filters:', { timeFilter, hourOfDay, dayOfWeek });

    let query = serviceClient
      .from('user_locations')
      .select('latitude, longitude, created_at');

    // Apply time filters
    const now = new Date();
    switch (timeFilter) {
      case 'today':
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        query = query.gte('created_at', startOfDay.toISOString());
        break;
      case 'this_week':
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0, 0, 0, 0);
        query = query.gte('created_at', startOfWeek.toISOString());
        break;
      case 'this_hour':
        const startOfHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());
        query = query.gte('created_at', startOfHour.toISOString());
        break;
    }

    const { data: locations, error } = await query;

    if (error) throw error;

    console.log(`Found ${locations?.length || 0} location points from all users`);

    // Filter by hour of day or day of week if specified
    let filteredLocations = locations || [];
    
    if (hourOfDay !== null && hourOfDay !== undefined) {
      const targetHour = parseInt(hourOfDay);
      filteredLocations = filteredLocations.filter(loc => {
        const locHour = new Date(loc.created_at).getHours();
        return locHour === targetHour;
      });
    }

    if (dayOfWeek !== null && dayOfWeek !== undefined) {
      const targetDay = parseInt(dayOfWeek);
      filteredLocations = filteredLocations.filter(loc => {
        const locDay = new Date(loc.created_at).getDay();
        return locDay === targetDay;
      });
    }

    // Create density grid - aggregate locations into grid cells for heatmap
    // Using smaller grid for more detailed visualization
    const gridSize = 0.003; // ~300m grid cells for finer granularity
    const densityMap = new Map<string, number>();

    filteredLocations.forEach(loc => {
      const lat = parseFloat(String(loc.latitude));
      const lng = parseFloat(String(loc.longitude));
      if (isNaN(lat) || isNaN(lng)) return;
      
      const gridLat = Math.floor(lat / gridSize) * gridSize;
      const gridLng = Math.floor(lng / gridSize) * gridSize;
      const key = `${gridLat.toFixed(6)},${gridLng.toFixed(6)}`;
      densityMap.set(key, (densityMap.get(key) || 0) + 1);
    });

    // Convert to GeoJSON format for Mapbox heatmap layer
    const features = Array.from(densityMap.entries()).map(([key, count]) => {
      const [lat, lng] = key.split(',').map(Number);
      return {
        type: 'Feature',
        properties: {
          density: count,
          intensity: Math.min(count / 10, 1), // Normalize to 0-1 for styling
        },
        geometry: {
          type: 'Point',
          coordinates: [lng, lat], // GeoJSON uses [lng, lat] order
        },
      };
    });

    const geojson = {
      type: 'FeatureCollection',
      features,
    };

    // Calculate statistics for UI display
    const densityValues = Array.from(densityMap.values());
    const maxDensity = densityValues.length > 0 ? Math.max(...densityValues) : 0;
    const avgDensity = densityValues.length > 0 
      ? densityValues.reduce((a, b) => a + b, 0) / densityValues.length 
      : 0;

    console.log(`Processed ${features.length} density grid cells, max: ${maxDensity}, avg: ${avgDensity.toFixed(2)}`);

    return new Response(
      JSON.stringify({
        success: true,
        geojson,
        stats: {
          total_points: filteredLocations.length,
          grid_cells: features.length,
          max_density: maxDensity,
          avg_density: avgDensity,
        },
      }),
      {
        headers: { ...rateLimitHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in get-location-density:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 400,
        headers: { ...rateLimitHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
