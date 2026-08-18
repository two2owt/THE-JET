import { corsHeaders, logVersion } from "../_shared/cors.ts";

const FUNCTION_NAME = "get-mapbox-token";
logVersion(FUNCTION_NAME);

// Per-IP rate limit. Prevents casual scraping of the public token endpoint.
// In-memory / per-instance is imperfect on horizontally-scaled edge functions
// but is a meaningful speed bump vs. zero limiting and matches the pattern
// already used by get-location-density / get-movement-paths.
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 20; // Legitimate clients cache the token; 20/min is generous.
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

// Origin allowlist. The Mapbox public token is only ever handed to our own
// first-party web/app origins, so third-party sites and scripts can't use this
// endpoint to bypass Mapbox domain restrictions or burn our quota.
const ALLOWED_ORIGIN_SUFFIXES = [
  "jet-around.com",
  "jet-around.lovable.app",
  "lovable.app",
  "lovableproject.com",
  "localhost",
  "127.0.0.1",
];

function originAllowed(req: Request): boolean {
  const raw = req.headers.get("origin") ?? req.headers.get("referer");
  // Native app shells (Capacitor) send no Origin; they authenticate by
  // presenting a Supabase Authorization header instead.
  if (!raw) return Boolean(req.headers.get("authorization"));
  let host: string;
  try {
    host = new URL(raw).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (host === "localhost" || host === "127.0.0.1") return true;
  return ALLOWED_ORIGIN_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
}

function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

function overLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now >= entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX_REQUESTS;
}

// Best-effort cleanup so the map doesn't grow unbounded on long-lived instances.
setInterval(
  () => {
    const now = Date.now();
    for (const [ip, entry] of rateLimitMap) {
      if (now >= entry.resetAt) rateLimitMap.delete(ip);
    }
  },
  5 * 60 * 1000,
);

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const ip = clientIp(req);
  if (!originAllowed(req)) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (overLimit(ip)) {
    return new Response(JSON.stringify({ error: "Too many requests" }), {
      status: 429,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Retry-After": "60",
      },
    });
  }

  try {
    const mapboxToken = Deno.env.get("MAPBOX_PUBLIC_TOKEN");

    if (!mapboxToken) {
      throw new Error("MAPBOX_PUBLIC_TOKEN not configured");
    }

    // Mapbox GL JS requires a public token (pk.*). Never expose secret tokens (sk.*) to clients.
    if (!mapboxToken.startsWith("pk.")) {
      throw new Error(
        'MAPBOX_PUBLIC_TOKEN must be a public token starting with "pk."',
      );
    }

    return new Response(JSON.stringify({ token: mapboxToken }), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("Error fetching Mapbox token:", error);

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";

    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  }
});
