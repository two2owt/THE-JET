// Shared CORS headers for all edge functions
// Version: 1.0.0
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Version constant for deployment tracking
export const EDGE_FUNCTION_VERSION = "2026-02-04.1";

// Helper to log version on function boot
export function logVersion(functionName: string) {
  console.log(
    `[${functionName}] v${EDGE_FUNCTION_VERSION} - booted at ${new Date().toISOString()}`,
  );
}
