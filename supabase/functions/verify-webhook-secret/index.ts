import { corsHeaders, logVersion } from "../_shared/cors.ts";

const FUNCTION_NAME = "verify-webhook-secret";
logVersion(FUNCTION_NAME);

const cors = {
  ...corsHeaders,
  "Access-Control-Allow-Headers":
    corsHeaders["Access-Control-Allow-Headers"] +
    ", x-webhook-secret, jetbridge_webhook_secret, jetbridge-webhook-secret",
};

// Lightweight endpoint JET Bridge (or anyone) can ping with their current
// webhook secret to confirm it matches what this project expects.
// Returns:
//   200 { match: true, fingerprint } when the provided secret == JETBRIDGE_WEBHOOK_SECRET
//   401 { match: false, expected_fingerprint, provided_fingerprint } otherwise
//
// "fingerprint" = SHA-256 of the secret, hex, last 12 chars. Safe to log; not
// reversible to the secret itself. Lets operators eyeball whether two sides
// hold the same value without ever revealing it.
async function fingerprint(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const hex = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex.slice(-12);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: cors });
  }

  const expected = Deno.env.get("JETBRIDGE_WEBHOOK_SECRET") ?? "";
  const provided =
    req.headers.get("x-webhook-secret") ??
    req.headers.get("jetbridge_webhook_secret") ??
    req.headers.get("jetbridge-webhook-secret") ??
    "";

  if (!expected) {
    return new Response(
      JSON.stringify({ error: "Server misconfigured: JETBRIDGE_WEBHOOK_SECRET not set" }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

  const expectedFp = await fingerprint(expected);
  const providedFp = provided ? await fingerprint(provided) : null;
  const match = provided === expected;

  console.log(
    `[${FUNCTION_NAME}] check match=${match} expected_fp=${expectedFp} provided_fp=${providedFp ?? "<none>"}`,
  );

  return new Response(
    JSON.stringify({
      match,
      expected_fingerprint: expectedFp,
      provided_fingerprint: providedFp,
      checked_at: new Date().toISOString(),
    }),
    {
      status: match ? 200 : 401,
      headers: { ...cors, "Content-Type": "application/json" },
    },
  );
});