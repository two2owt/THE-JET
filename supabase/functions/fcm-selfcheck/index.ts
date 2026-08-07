import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { getServiceAccount, sendFcmV1 } from "../_shared/fcm.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const raw = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON");
  const sa = getServiceAccount();
  let oauth: string = "not_attempted";
  if (sa) {
    // Attempt a send with an obviously-invalid token: proves OAuth minting works
    // without delivering anything. Auth failures surface as 401 instead.
    const r = await sendFcmV1("selfcheck-invalid-token", { title: "x", body: "x" }, {})
      .catch((e) => ({ ok: false, unregistered: false, error: String(e) }));
    oauth = r.ok ? "unexpected_ok" : (r.error ?? "unknown");
  }

  return new Response(JSON.stringify({
    secret_present: !!raw,
    secret_length: raw?.length ?? 0,
    parses_as_service_account: !!sa,
    project_id: sa?.project_id ?? null,
    client_email_domain: sa?.client_email?.split("@")[1] ?? null,
    fcm_probe: oauth,
  }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
