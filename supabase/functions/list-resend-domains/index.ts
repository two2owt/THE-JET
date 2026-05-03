import { corsHeaders, logVersion } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

logVersion("list-resend-domains");

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL =
  Deno.env.get("RESEND_FROM_EMAIL") ?? "JET <noreply@jet-around.com>";

function extractDomain(from: string): string | null {
  const match = from.match(/<([^>]+)>/);
  const addr = match ? match[1] : from.trim();
  const at = addr.indexOf("@");
  if (at === -1) return null;
  return addr.slice(at + 1).toLowerCase();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Admin gate
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: role } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!role) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!RESEND_API_KEY) {
      return new Response(
        JSON.stringify({ error: "RESEND_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const res = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
    });
    if (!res.ok) {
      const text = await res.text();
      return new Response(
        JSON.stringify({ error: "Resend API error", detail: text }),
        { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const json = await res.json();
    const domains: Array<{ name: string; status: string; region?: string; created_at?: string }> =
      (json?.data ?? []).map((d: any) => ({
        name: d.name,
        status: d.status,
        region: d.region,
        created_at: d.created_at,
      }));

    const fromDomain = extractDomain(FROM_EMAIL);
    const matched = fromDomain
      ? domains.find((d) => d.name.toLowerCase() === fromDomain)
      : null;
    const isFromVerified = matched?.status === "verified";

    return new Response(
      JSON.stringify({
        from: FROM_EMAIL,
        fromDomain,
        isFromVerified,
        matchedDomainStatus: matched?.status ?? null,
        domains,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
