import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

/**
 * Daily automation: emails verified accounts that never finished onboarding.
 *
 * Eligibility (all must hold):
 *  - auth email is confirmed
 *  - profiles.onboarding_completed = false
 *  - account is at least MIN_AGE_HOURS old (don't interrupt a live signup)
 *  - account is younger than MAX_AGE_DAYS (stop nagging dead accounts)
 *  - email_notifications_enabled is not false
 *  - fewer than MAX_NUDGES already sent, last one older than THROTTLE_HOURS
 *
 * Called by pg_cron with the shared admin hook secret in the Authorization
 * header. Public prefix, so the secret is verified inside the handler.
 */

const MIN_AGE_HOURS = 24;
// Wide enough to cover the existing backlog of stalled sign-ups; MAX_NUDGES
// still caps each person at two emails, ever.
const MAX_AGE_DAYS = 365;
const THROTTLE_HOURS = 72;
const MAX_NUDGES = 2;
const CHANNEL_KEY = "finish-onboarding";
const BATCH_LIMIT = 200;

export const Route = createFileRoute("/api/public/hooks/nudge-incomplete-onboarding")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const supabaseUrl = process.env["SUPABASE_URL"];
        const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
        const hookSecret = process.env["NOTIFY_ADMIN_HOOK_SECRET"];
        if (!supabaseUrl || !serviceKey) {
          return Response.json({ error: "Server configuration error" }, { status: 500 });
        }

        const token = (request.headers.get("authorization") ?? "").replace("Bearer ", "").trim();
        if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const admin = createClient(supabaseUrl, serviceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        // Cron secret, service role, or a signed-in admin may trigger a run.
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

        const now = Date.now();
        const minAge = new Date(now - MIN_AGE_HOURS * 3_600_000).toISOString();
        const maxAge = new Date(now - MAX_AGE_DAYS * 86_400_000).toISOString();

        const { data: profiles, error: profileError } = await admin
          .from("profiles")
          .select("id, display_name, created_at")
          .eq("onboarding_completed", false)
          .lte("created_at", minAge)
          .gte("created_at", maxAge)
          .limit(BATCH_LIMIT);

        if (profileError) {
          return Response.json({ error: profileError.message }, { status: 500 });
        }

        const candidates = profiles ?? [];
        const candidateIds = candidates.map((p) => p.id);
        if (candidateIds.length === 0) {
          return Response.json({ candidates: 0, sent: 0, skipped: 0, failures: [] });
        }

        const { data: prefs } = await admin
          .from("user_preferences")
          .select("user_id, email_notifications_enabled")
          .in("user_id", candidateIds);
        const optedOut = new Set(
          (prefs ?? [])
            .filter((p) => p.email_notifications_enabled === false)
            .map((p) => p.user_id),
        );

        const { data: throttleRows } = await admin
          .from("email_notification_throttle")
          .select("user_id, channel_key, last_sent_at")
          .in("user_id", candidateIds)
          .like("channel_key", `${CHANNEL_KEY}%`);

        let sent = 0;
        let skipped = 0;
        const failures: string[] = [];

        for (const profile of candidates) {
          const userId = profile.id;

          if (optedOut.has(userId)) {
            skipped++;
            continue;
          }

          const history = (throttleRows ?? []).filter((r) => r.user_id === userId);
          if (history.length >= MAX_NUDGES) {
            skipped++;
            continue;
          }
          const lastSent = history
            .map((r) => new Date(r.last_sent_at).getTime())
            .sort((a, b) => b - a)[0];
          if (lastSent && now - lastSent < THROTTLE_HOURS * 3_600_000) {
            skipped++;
            continue;
          }

          const { data: authUser } = await admin.auth.admin.getUserById(userId);
          const email = authUser?.user?.email;
          if (!email || !authUser?.user?.email_confirmed_at) {
            skipped++;
            continue;
          }

          const attempt = history.length + 1;
          const idempotencyKey = `finish-onboarding-${userId}-${attempt}`;

          // Claim the slot first so a retried run cannot double-send.
          const { error: claimError } = await admin
            .from("email_notification_throttle")
            .upsert(
              {
                user_id: userId,
                channel_key: `${CHANNEL_KEY}:${attempt}`,
                last_sent_at: new Date().toISOString(),
              },
              { onConflict: "user_id,channel_key" },
            );
          if (claimError) {
            skipped++;
            continue;
          }

          try {
            const response = await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${serviceKey}`,
              },
              body: JSON.stringify({
                templateName: "finish-onboarding",
                recipientEmail: email,
                idempotencyKey,
                templateData: { name: profile.display_name ?? undefined, attempt },
              }),
            });

            if (!response.ok) {
              const details = (await response.text()).slice(0, 300);
              failures.push(`${email}: ${response.status}`);
              await admin.from("email_send_log").insert({
                message_id: idempotencyKey,
                template_name: "finish-onboarding",
                recipient_email: email,
                status: "failed",
                error_message: `send-transactional-email ${response.status}: ${details}`.slice(0, 500),
                metadata: { source: "nudge-incomplete-onboarding", attempt },
              });
              continue;
            }
            sent++;
          } catch (err) {
            failures.push(`${email}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }

        return Response.json({ candidates: candidateIds.length, sent, skipped, failures });
      },
    },
  },
});