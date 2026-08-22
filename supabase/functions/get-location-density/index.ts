import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders,
  logVersion,
  EDGE_FUNCTION_VERSION,
} from "../_shared/cors.ts";
import { getAuthenticatedUserId } from "../_shared/require-auth.ts";
import { ErrorCode, unauthorized } from "../_shared/http.ts";
import {
  buildCutoffLadder,
  clampWindowMinutes,
  RETENTION_WINDOW_MINUTES,
  retentionCutoff,
} from "../_shared/fallback-windows.ts";

const FUNCTION_NAME = "get-location-density";
logVersion(FUNCTION_NAME);

/**
 * k-anonymity floor: a grid cell is only returned when at least this many
 * DISTINCT users contributed points to it. Prevents a single person's
 * movements from being readable off the heatmap (anti-stalking guard).
 */
const K_ANONYMITY_MIN_USERS = 3;

// Rate limiting: 15 requests per minute per IP
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 15;
const SUSPICIOUS_THRESHOLD = 12; // Log as suspicious when 80% of limit reached
const rateLimitMap = new Map<
  string,
  { count: number; resetTime: number; violations: number }
>();

function getRateLimitKey(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

function checkRateLimit(ip: string): {
  allowed: boolean;
  remaining: number;
  resetIn: number;
  count: number;
  violations: number;
} {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now >= entry.resetTime) {
    const violations = entry?.violations || 0;
    rateLimitMap.set(ip, {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW_MS,
      violations,
    });
    return {
      allowed: true,
      remaining: RATE_LIMIT_MAX_REQUESTS - 1,
      resetIn: RATE_LIMIT_WINDOW_MS,
      count: 1,
      violations,
    };
  }

  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    entry.violations++;
    return {
      allowed: false,
      remaining: 0,
      resetIn: entry.resetTime - now,
      count: entry.count,
      violations: entry.violations,
    };
  }

  entry.count++;
  return {
    allowed: true,
    remaining: RATE_LIMIT_MAX_REQUESTS - entry.count,
    resetIn: entry.resetTime - now,
    count: entry.count,
    violations: entry.violations,
  };
}

// Security audit logging
async function logSecurityEvent(
  eventType: string,
  clientIp: string,
  userAgent: string | null,
  requestCount: number,
  details: Record<string, unknown>,
) {
  try {
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    await serviceClient.from("security_audit_logs").insert({
      event_type: eventType,
      endpoint: "get-location-density",
      client_ip: clientIp,
      user_agent: userAgent,
      request_count: requestCount,
      time_window_seconds: Math.round(RATE_LIMIT_WINDOW_MS / 1000),
      details,
    });

    console.log(`[SECURITY AUDIT] ${eventType} logged for IP: ${clientIp}`);
  } catch (error) {
    console.error("[SECURITY AUDIT] Failed to log event:", error);
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
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Aggregated GPS data is only available to authenticated users.
  const userId = await getAuthenticatedUserId(req);
  if (!userId) {
    return unauthorized();
  }

  // Check rate limit
  const clientIp = getRateLimitKey(req);
  const userAgent = req.headers.get("user-agent");
  const rateLimit = checkRateLimit(clientIp);

  const rateLimitHeaders = {
    ...corsHeaders,
    "X-RateLimit-Limit": RATE_LIMIT_MAX_REQUESTS.toString(),
    "X-RateLimit-Remaining": rateLimit.remaining.toString(),
    "X-RateLimit-Reset": Math.ceil(rateLimit.resetIn / 1000).toString(),
  };

  // Log rate limit exceeded
  if (!rateLimit.allowed) {
    console.warn(`Rate limit exceeded for IP: ${clientIp}`);

    // Log security event
    await logSecurityEvent(
      "rate_limit_exceeded",
      clientIp,
      userAgent,
      rateLimit.count,
      {
        violations_count: rateLimit.violations,
        reset_in_seconds: Math.ceil(rateLimit.resetIn / 1000),
      },
    );

    return new Response(
      JSON.stringify({
        success: false,
        error: "Too many requests. Please try again later.",
        code: ErrorCode.RATE_LIMITED,
      }),
      {
        status: 429,
        headers: {
          ...rateLimitHeaders,
          "Content-Type": "application/json",
          "Retry-After": Math.ceil(rateLimit.resetIn / 1000).toString(),
        },
      },
    );
  }

  // Log suspicious pattern (approaching rate limit)
  if (
    rateLimit.count >= SUSPICIOUS_THRESHOLD &&
    rateLimit.count === SUSPICIOUS_THRESHOLD
  ) {
    await logSecurityEvent(
      "suspicious_pattern",
      clientIp,
      userAgent,
      rateLimit.count,
      {
        pattern: "high_request_frequency",
        threshold_percentage: Math.round(
          (rateLimit.count / RATE_LIMIT_MAX_REQUESTS) * 100,
        ),
        remaining_requests: rateLimit.remaining,
      },
    );
  }

  // Log repeated violators
  if (rateLimit.violations >= 3 && rateLimit.count === 1) {
    await logSecurityEvent(
      "repeated_violator",
      clientIp,
      userAgent,
      rateLimit.count,
      {
        total_violations: rateLimit.violations,
        pattern: "persistent_abuse",
      },
    );
  }

  try {
    // Aggregated, non-PII density data — readable by any caller (authed or anon)
    // so the heatmap stays in sync with realtime user activity for all users.
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const url = new URL(req.url);

    // Read filters from URL params or request body
    let timeFilter = url.searchParams.get("time_filter") || "all";

    // Identify the caller (if signed in). A user's OWN points are never hidden
    // from them by the k-anonymity floor — it exists to protect other users,
    // and suppressing their own data is what makes the map look blank while
    // tracking is actually working.
    let callerId: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      try {
        const { data } = await serviceClient.auth.getUser(
          authHeader.replace("Bearer ", ""),
        );
        callerId = data.user?.id ?? null;
      } catch (_) {
        callerId = null;
      }
    }
    let hourOfDay = url.searchParams.get("hour_of_day");
    let dayOfWeek = url.searchParams.get("day_of_week");
    let timeWindowMinutesRaw: string | number | null = url.searchParams.get(
      "time_window_minutes",
    );

    // Also support POST body for filters (supabase.functions.invoke sends body)
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body.time_filter) timeFilter = body.time_filter;
        if (body.hour_of_day !== undefined)
          hourOfDay = String(body.hour_of_day);
        if (body.day_of_week !== undefined)
          dayOfWeek = String(body.day_of_week);
        if (body.time_window_minutes !== undefined)
          timeWindowMinutesRaw = body.time_window_minutes;
      } catch (_) {
        // No body or invalid JSON, use URL params
      }
    }

    // Parse and validate the time-window override. Accept 1 minute up to the
    // live retention window (30 days) — that is every real point we still
    // store, so a caller can never pull more history than retention keeps.
    const timeWindowMinutes = clampWindowMinutes(timeWindowMinutesRaw);

    console.log("Fetching location density with filters:", {
      timeFilter,
      hourOfDay,
      dayOfWeek,
      timeWindowMinutes,
    });

    const now = new Date();

    // Resolve the primary cutoff requested by the caller. "all" means the full
    // 30-day retention window: every point from every past sign-in/session
    // that is still retained feeds the heatmap.
    let primaryCutoff: Date | null = retentionCutoff(now);
    if (timeWindowMinutes !== null) {
      primaryCutoff = new Date(now.getTime() - timeWindowMinutes * 60_000);
    } else if (timeFilter === "today") {
      primaryCutoff = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
      );
    } else if (timeFilter === "this_week") {
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());
      startOfWeek.setHours(0, 0, 0, 0);
      primaryCutoff = startOfWeek;
    } else if (timeFilter === "this_hour") {
      primaryCutoff = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        now.getHours(),
      );
    }


    /** Builds the k-anonymised density grid for one cutoff. */
    const buildGrid = async (cutoff: Date | null) => {
      // PostgREST caps a single response at 1000 rows, which would silently
      // truncate the grid (and break the k-anonymity counts) as data grows.
      // Page through the table explicitly instead.
      const PAGE_SIZE = 1000;
      const locations: Array<Record<string, unknown>> = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        let query = serviceClient
          .from("user_locations")
          // `user_id` is used server-side only, to enforce the k-anonymity floor.
          // It is never included in the response payload.
          .select("latitude, longitude, created_at, user_id")
          .order("created_at", { ascending: true })
          .range(from, from + PAGE_SIZE - 1);
        if (cutoff) query = query.gte("created_at", cutoff.toISOString());

        const { data: page, error } = await query;
        if (error) throw error;
        if (!page?.length) break;
        locations.push(...page);
        if (page.length < PAGE_SIZE) break;
      }

      let filteredLocations = locations as Array<{
        latitude: unknown;
        longitude: unknown;
        created_at: string;
        user_id: string | null;
      }>;
      if (hourOfDay !== null && hourOfDay !== undefined) {
        const targetHour = parseInt(hourOfDay);
        filteredLocations = filteredLocations.filter(
          (loc) => new Date(loc.created_at).getHours() === targetHour,
        );
      }
      if (dayOfWeek !== null && dayOfWeek !== undefined) {
        const targetDay = parseInt(dayOfWeek);
        filteredLocations = filteredLocations.filter(
          (loc) => new Date(loc.created_at).getDay() === targetDay,
        );
      }

      // ~300m grid cells for finer granularity
      const gridSize = 0.003;
      const densityMap = new Map<
        string,
        { count: number; users: Set<string> }
      >();
      filteredLocations.forEach((loc) => {
        const lat = parseFloat(String(loc.latitude));
        const lng = parseFloat(String(loc.longitude));
        if (isNaN(lat) || isNaN(lng)) return;
        const gridLat = Math.floor(lat / gridSize) * gridSize;
        const gridLng = Math.floor(lng / gridSize) * gridSize;
        const key = `${gridLat.toFixed(6)},${gridLng.toFixed(6)}`;
        let cell = densityMap.get(key);
        if (!cell) {
          cell = { count: 0, users: new Set<string>() };
          densityMap.set(key, cell);
        }
        cell.count++;
        cell.users.add(String(loc.user_id ?? "anonymous"));
      });

      const allCells = Array.from(densityMap.entries());
      const visibleCells = allCells.filter(
        ([, cell]) =>
          cell.users.size >= K_ANONYMITY_MIN_USERS ||
          (callerId !== null && cell.users.has(callerId)),
      );
      // Freshest raw point in this window — used for end-to-end sync latency.
      let newestPointAt: string | null = null;
      for (const loc of filteredLocations) {
        const createdAt = (loc as { created_at?: string }).created_at;
        if (createdAt && (!newestPointAt || createdAt > newestPointAt)) {
          newestPointAt = createdAt;
        }
      }
      return {
        allCells,
        visibleCells,
        points: filteredLocations.length,
        newestPointAt,
      };

    };

    // Fallback ladder: when the requested window yields no visible cells the
    // heatmap would render empty, so progressively widen to the most recent
    // data available and flag it in the response. Steps are configurable via
    // the FALLBACK_WINDOW_MINUTES secret (default 24h → 7d → 30d → all time).
    const minutesSince = (d: Date | null) =>
      d === null
        ? Number.POSITIVE_INFINITY
        : Math.round((now.getTime() - d.getTime()) / 60_000);
    // Never widen past retention — there is nothing older left to show.
    const ladder: (Date | null)[] = buildCutoffLadder(now, primaryCutoff).map(
      (c) => c ?? retentionCutoff(now),
    );

    let result = await buildGrid(ladder[0]);
    let usedCutoff = ladder[0];
    let isFallback = false;
    for (
      let i = 1;
      i < ladder.length && result.visibleCells.length === 0;
      i++
    ) {
      result = await buildGrid(ladder[i]);
      usedCutoff = ladder[i];
      isFallback = result.visibleCells.length > 0;
    }

    const { allCells, visibleCells } = result;
    const suppressedCells = allCells.length - visibleCells.length;
    if (isFallback) {
      console.log(
        `Density fallback engaged — widened window to ${minutesSince(usedCutoff)} min`,
      );
    }
    // Convert to GeoJSON format for Mapbox heatmap layer
    const features = visibleCells.map(([key, cell]) => {
      const count = cell.count;
      const [lat, lng] = key.split(",").map(Number);
      return {
        type: "Feature",
        properties: {
          density: count,
          intensity: Math.min(count / 10, 1), // Normalize to 0-1 for styling
        },
        geometry: {
          type: "Point",
          coordinates: [lng, lat], // GeoJSON uses [lng, lat] order
        },
      };
    });

    const geojson = {
      type: "FeatureCollection",
      features,
    };

    // Calculate statistics for UI display
    const densityValues = visibleCells.map(([, cell]) => cell.count);
    const maxDensity =
      densityValues.length > 0 ? Math.max(...densityValues) : 0;
    const avgDensity =
      densityValues.length > 0
        ? densityValues.reduce((a, b) => a + b, 0) / densityValues.length
        : 0;

    // Freshest raw point that fed this payload — the client uses it to compute
    // true end-to-end sync latency (DB write -> heatmap paint).
    const newestPointAt = result.newestPointAt;


    console.log(
      `Processed ${features.length} density grid cells, max: ${maxDensity}, avg: ${avgDensity.toFixed(2)}`,
    );

    return new Response(
      JSON.stringify({
        success: true,
        geojson,
        stats: {
          total_points: densityValues.reduce((a, b) => a + b, 0),
          grid_cells: features.length,
          max_density: maxDensity,
          avg_density: avgDensity,
          suppressed_cells: suppressedCells,
          k_anonymity_min_users: K_ANONYMITY_MIN_USERS,
          newest_point_at: newestPointAt,
          served_at: new Date().toISOString(),
          is_fallback: isFallback,
          fallback_window_minutes: isFallback
            ? Number.isFinite(minutesSince(usedCutoff))
              ? minutesSince(usedCutoff)
              : null
            : null,
        },
      }),

      {
        headers: { ...rateLimitHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error in get-location-density:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";

    return new Response(
      JSON.stringify({
        success: false,
        error: "Internal server error",
        code: ErrorCode.INTERNAL_ERROR,
        detail: errorMessage.slice(0, 500),
      }),
      {
        status: 500,
        headers: { ...rateLimitHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
