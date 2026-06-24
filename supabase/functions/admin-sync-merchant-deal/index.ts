import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, logVersion } from "../_shared/cors.ts";

const FUNCTION_NAME = "admin-sync-merchant-deal";
logVersion(FUNCTION_NAME);

/**
 * Admin-only wrapper that forwards a payload to sync-merchant-deals using the
 * shared JETBRIDGE_WEBHOOK_SECRET server-side. The browser never sees the
 * webhook secret.
 *
 * Expected body (matches sync-merchant-deals):
 *   { action: 'create' | 'update' | 'delete', deal: { id, ... } }
 *
 * The deal_id is required for every action. For delete, only { id } is needed.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const webhookSecret = Deno.env.get("JETBRIDGE_WEBHOOK_SECRET");

    if (!webhookSecret) {
      return new Response(
        JSON.stringify({ error: "Server misconfigured: JETBRIDGE_WEBHOOK_SECRET missing" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Verify caller is authenticated
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    // 2. Verify caller is admin (service-role bypasses RLS to be safe)
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: isAdminData, error: roleErr } = await adminClient.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (roleErr || isAdminData !== true) {
      console.warn(`Non-admin user ${userId} attempted to trigger sync`);
      return new Response(JSON.stringify({ error: "Forbidden: admin role required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Validate body has minimum shape
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || !body.action || !body.deal?.id) {
      return new Response(
        JSON.stringify({
          error: "Invalid payload",
          hint: "Body must be { action: 'create'|'update'|'delete', deal: { id, ... } }",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Admin ${userId} triggering ${body.action} for deal ${body.deal.id}`);

    // 4. Forward to sync-merchant-deals with the webhook secret server-side
    const forwardUrl = `${supabaseUrl}/functions/v1/sync-merchant-deals`;
    const upstream = await fetch(forwardUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-secret": webhookSecret,
      },
      body: JSON.stringify(body),
    });

    const text = await upstream.text();
    let parsed: unknown = text;
    try { parsed = JSON.parse(text); } catch { /* keep raw text */ }

    return new Response(
      JSON.stringify({ status: upstream.status, ok: upstream.ok, result: parsed }),
      { status: upstream.ok ? 200 : 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("admin-sync-merchant-deal error:", msg);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});