import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

/**
 * Syncs marketing-consented, email-verified users into a Resend audience so
 * newsletters can be composed and sent from the Resend Broadcasts dashboard.
 *
 * - Adds/updates contacts for users with `marketing_emails_enabled = true`
 *   whose auth email is confirmed and who are not in `suppressed_emails`.
 * - Marks contacts unsubscribed in Resend for anyone who opted back out or
 *   was suppressed (bounce/complaint), so the audience never re-mails them.
 *
 * Public prefix: authorization is verified inside the handler (cron secret,
 * service role key, or a signed-in admin JWT).
 */

const RESEND_API = "https://api.resend.com";
const AUDIENCE_NAME = "JET Newsletter";

type ResendContact = { id: string; email: string; unsubscribed: boolean };

async function resendFetch(apiKey: string, path: string, init?: RequestInit) {
  const res = await fetch(`${RESEND_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { ok: res.ok, status: res.status, body: body as never };
}

/** Returns the configured audience id, or finds/creates the JET audience. */
async function resolveAudienceId(apiKey: string): Promise<string> {
  const configured = process.env["RESEND_AUDIENCE_ID"];
  if (configured) return configured;

  const list = await resendFetch(apiKey, "/audiences");
  if (list.ok) {
    const rows = ((list.body as { data?: { id: string; name: string }[] })?.data ?? []);
    const existing = rows.find((a) => a.name === AUDIENCE_NAME);
    if (existing) return existing.id;
  }
  const created = await resendFetch(apiKey, "/audiences", {
    method: "POST",
    body: JSON.stringify({ name: AUDIENCE_NAME }),
  });
  if (!created.ok) {
    throw new Error(`Resend audience create failed [${created.status}]: ${JSON.stringify(created.body)}`);
  }
  return (created.body as { id: string }).id;
}

export const Route = createFileRoute("/api/public/hooks/sync-resend-audience")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const supabaseUrl = process.env["SUPABASE_URL"];
        const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
        const hookSecret = process.env["NOTIFY_ADMIN_HOOK_SECRET"];
        const resendKey = process.env["RESEND_API_KEY"];
        if (!supabaseUrl || !serviceKey) {
          return Response.json({ error: "Server configuration error" }, { status: 500 });
        }
        if (!resendKey) {
          return Response.json({ error: "RESEND_API_KEY is not configured" }, { status: 500 });
        }

        const token = (request.headers.get("authorization") ?? "").replace("Bearer ", "").trim();
        if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const admin = createClient(supabaseUrl, serviceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        let authorized = (!!hookSecret && token === hookSecret) || token === serviceKey;
        if (!authorized) {
          const { data: userData } = await admin.auth.getUser(token);
          const callerId = userData?.user?.id;
          if (callerId) {
            const { data: isAdmin } = await admin.rpc("has_role", {
              _user_id: callerId,
              _role: "admin",
            });
            authorized = isAdmin === true;
          }
        }
        if (!authorized) return Response.json({ error: "Unauthorized" }, { status: 401 });

        let audienceId: string;
        try {
          audienceId = await resolveAudienceId(resendKey);
        } catch (err) {
          return Response.json(
            { error: err instanceof Error ? err.message : String(err) },
            { status: 502 },
          );
        }

        // --- Who has opted in / out ---------------------------------------
        const { data: prefs, error: prefsError } = await admin
          .from("user_preferences")
          .select("user_id, marketing_emails_enabled");
        if (prefsError) {
          return Response.json({ error: prefsError.message }, { status: 500 });
        }

        const optedIn = (prefs ?? []).filter((p) => p.marketing_emails_enabled === true);
        const optedInIds = optedIn.map((p) => p.user_id);

        const profileNames = new Map<string, string | null>();
        if (optedInIds.length) {
          const { data: profiles } = await admin
            .from("profiles")
            .select("id, display_name")
            .in("id", optedInIds);
          for (const p of profiles ?? []) profileNames.set(p.id, p.display_name);
        }

        const { data: suppressed } = await admin.from("suppressed_emails").select("email");
        const suppressedSet = new Set(
          (suppressed ?? []).map((s: { email: string }) => s.email.toLowerCase()),
        );

        // Resolve verified email addresses for opted-in users.
        const desired = new Map<string, { firstName: string | null }>();
        for (const userId of optedInIds) {
          const { data: authUser } = await admin.auth.admin.getUserById(userId);
          const email = authUser?.user?.email?.toLowerCase();
          if (!email || !authUser?.user?.email_confirmed_at) continue;
          if (suppressedSet.has(email)) continue;
          desired.set(email, { firstName: profileNames.get(userId) ?? null });
        }

        // --- Current audience state ---------------------------------------
        const current = await resendFetch(resendKey, `/audiences/${audienceId}/contacts`);
        const existingContacts: ResendContact[] = current.ok
          ? ((current.body as { data?: ResendContact[] })?.data ?? [])
          : [];
        const existingByEmail = new Map(
          existingContacts.map((c) => [c.email.toLowerCase(), c]),
        );

        let synced = 0;
        let removed = 0;
        const failures: string[] = [];

        for (const [email, meta] of desired) {
          const existing = existingByEmail.get(email);
          // Never resubscribe someone who unsubscribed inside Resend itself.
          if (existing?.unsubscribed) continue;
          const payload = {
            email,
            first_name: meta.firstName ?? undefined,
            unsubscribed: false,
          };
          const res = existing
            ? await resendFetch(resendKey, `/audiences/${audienceId}/contacts/${existing.id}`, {
                method: "PATCH",
                body: JSON.stringify({ unsubscribed: false, first_name: meta.firstName ?? undefined }),
              })
            : await resendFetch(resendKey, `/audiences/${audienceId}/contacts`, {
                method: "POST",
                body: JSON.stringify(payload),
              });
          if (res.ok) synced++;
          else failures.push(`${email}: ${res.status}`);
        }

        for (const contact of existingContacts) {
          const email = contact.email.toLowerCase();
          if (desired.has(email) || contact.unsubscribed) continue;
          const res = await resendFetch(
            resendKey,
            `/audiences/${audienceId}/contacts/${contact.id}`,
            { method: "PATCH", body: JSON.stringify({ unsubscribed: true }) },
          );
          if (res.ok) removed++;
          else failures.push(`${email}: ${res.status}`);
        }

        await admin.from("marketing_audience_sync_log").insert({
          audience_id: audienceId,
          synced_count: synced,
          removed_count: removed,
          failed_count: failures.length,
          details: { failures: failures.slice(0, 25), eligible: desired.size },
        });

        return Response.json({
          audienceId,
          eligible: desired.size,
          synced,
          unsubscribed: removed,
          failures,
        });
      },
    },
  },
});