import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, logVersion } from "../_shared/cors.ts";

const FUNCTION_NAME = "admin-bulk-provision-users";
logVersion(FUNCTION_NAME);

/**
 * Admin-only bulk user provisioning.
 *
 * Recreates a list of accounts in the environment this function runs in
 * (invoke from the preview app => Test DB, from the live app => Live DB).
 *
 * Body: { users: [{ email, display_name?, password? }], sendInvite?: boolean }
 * Returns: { results: [{ email, status: 'created'|'exists'|'error', user_id?, password?, error? }] }
 */

const MAX_USERS = 200;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Incoming = { email?: unknown; display_name?: unknown; password?: unknown };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function randomPassword() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return "Jet-" + btoa(String.fromCharCode(...bytes)).replace(/[^a-zA-Z0-9]/g, "").slice(0, 20) + "1!";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // 1. Authenticated caller
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);

    // 2. Admin role required
    const admin = createClient(supabaseUrl, serviceKey);
    const { data: isAdmin, error: roleErr } = await admin.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "admin",
    });
    if (roleErr || isAdmin !== true) {
      console.warn(`Non-admin ${userData.user.id} attempted bulk provisioning`);
      return json({ error: "Forbidden: admin role required" }, 403);
    }

    // 3. Validate input
    let body: { users?: unknown; sendInvite?: unknown };
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }
    if (!Array.isArray(body.users) || body.users.length === 0) {
      return json({ error: "users must be a non-empty array" }, 400);
    }
    if (body.users.length > MAX_USERS) {
      return json({ error: `Too many users in one request (max ${MAX_USERS})` }, 400);
    }
    const sendInvite = body.sendInvite === true;

    const parsed: { email: string; display_name: string | null; password: string | null }[] = [];
    for (const raw of body.users as Incoming[]) {
      const email = typeof raw?.email === "string" ? raw.email.trim().toLowerCase() : "";
      if (!EMAIL_RE.test(email) || email.length > 254) {
        return json({ error: `Invalid email: ${String(raw?.email).slice(0, 80)}` }, 400);
      }
      const displayName =
        typeof raw?.display_name === "string" && raw.display_name.trim()
          ? raw.display_name.trim().slice(0, 120)
          : null;
      const password =
        typeof raw?.password === "string" && raw.password.length >= 8
          ? raw.password.slice(0, 72)
          : null;
      parsed.push({ email, display_name: displayName, password });
    }

    // 4. Provision sequentially (keeps auth rate limits happy, order is stable)
    const results: Record<string, unknown>[] = [];
    for (const u of parsed) {
      try {
        if (sendInvite) {
          const { data, error } = await admin.auth.admin.inviteUserByEmail(u.email, {
            data: u.display_name ? { display_name: u.display_name } : undefined,
          });
          if (error) {
            const exists = /already/i.test(error.message ?? "");
            results.push({ email: u.email, status: exists ? "exists" : "error", error: error.message });
            continue;
          }
          results.push({ email: u.email, status: "created", user_id: data.user?.id, invited: true });
          continue;
        }

        const password = u.password ?? randomPassword();
        const { data, error } = await admin.auth.admin.createUser({
          email: u.email,
          password,
          email_confirm: true,
          user_metadata: u.display_name ? { display_name: u.display_name } : {},
        });
        if (error) {
          const exists = /already|registered|duplicate/i.test(error.message ?? "");
          results.push({ email: u.email, status: exists ? "exists" : "error", error: error.message });
          continue;
        }

        // Trigger handles profile creation; ensure display_name is set.
        if (data.user && u.display_name) {
          await admin.from("profiles").update({ display_name: u.display_name }).eq("id", data.user.id);
        }

        results.push({ email: u.email, status: "created", user_id: data.user?.id, password });
      } catch (e) {
        results.push({ email: u.email, status: "error", error: e instanceof Error ? e.message : String(e) });
      }
    }

    const summary = {
      created: results.filter((r) => r.status === "created").length,
      exists: results.filter((r) => r.status === "exists").length,
      errors: results.filter((r) => r.status === "error").length,
    };
    console.log(`[${FUNCTION_NAME}] admin ${userData.user.id}`, summary);

    return json({ summary, results });
  } catch (e) {
    console.error(`[${FUNCTION_NAME}] failed`, e);
    return json({ error: "Internal error" }, 500);
  }
});
