import { corsHeaders, logVersion } from "../_shared/cors.ts";

const FUNCTION_NAME = "get-vapid-key";
logVersion(FUNCTION_NAME);

/**
 * Returns the VAPID *public* key used by the browser to create a Push
 * subscription. This value is public by design (it ships in every push
 * subscription request) — the private key never leaves the backend.
 *
 * Needed because the key is stored as a backend secret, which Vite cannot
 * inline into the client bundle at build time.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const publicKey = Deno.env.get("VITE_VAPID_PUBLIC_KEY");

  if (!publicKey) {
    console.error("VITE_VAPID_PUBLIC_KEY is not configured");
    return new Response(
      JSON.stringify({ error: "VAPID public key not configured" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  return new Response(JSON.stringify({ publicKey }), {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      // Key is stable; let clients cache it for an hour.
      "Cache-Control": "public, max-age=3600",
    },
  });
});
