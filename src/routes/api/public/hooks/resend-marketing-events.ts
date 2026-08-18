import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * Receives Resend webhook events for the newsletter audience and mirrors
 * opt-outs back into JET so the app never re-adds an unsubscribed address.
 *
 * Handled events:
 *  - contact.updated / contact.deleted  -> unsubscribed inside Resend
 *  - email.bounced / email.complained   -> hard opt-out + suppression row
 *
 * Signature verification uses Resend's Svix-compatible headers.
 */

type ResendEvent = {
  type?: string;
  data?: {
    email?: string;
    to?: string | string[];
    unsubscribed?: boolean;
  };
};

/** Svix signature: HMAC-SHA256 over `${id}.${timestamp}.${body}`, base64. */
function verifySvixSignature(
  secret: string,
  id: string,
  timestamp: string,
  body: string,
  signatureHeader: string,
): boolean {
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");
  const expectedBuf = Buffer.from(expected);
  return signatureHeader
    .split(" ")
    .map((part) => part.split(",").pop() ?? "")
    .some((candidate) => {
      const buf = Buffer.from(candidate);
      return (
        buf.length === expectedBuf.length && timingSafeEqual(buf, expectedBuf)
      );
    });
}

export const Route = createFileRoute(
  "/api/public/hooks/resend-marketing-events",
)({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const supabaseUrl = process.env["SUPABASE_URL"];
        const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
        const webhookSecret = process.env["RESEND_WEBHOOK_SECRET"];
        if (!supabaseUrl || !serviceKey || !webhookSecret) {
          return Response.json(
            { error: "Server configuration error" },
            { status: 500 },
          );
        }

        const body = await request.text();
        const id = request.headers.get("svix-id") ?? "";
        const timestamp = request.headers.get("svix-timestamp") ?? "";
        const signature = request.headers.get("svix-signature") ?? "";
        if (!id || !timestamp || !signature) {
          return Response.json(
            { error: "Missing signature headers" },
            { status: 401 },
          );
        }
        // Reject replays older than 5 minutes.
        const sentAt = Number(timestamp) * 1000;
        if (
          !Number.isFinite(sentAt) ||
          Math.abs(Date.now() - sentAt) > 5 * 60_000
        ) {
          return Response.json({ error: "Stale signature" }, { status: 401 });
        }
        if (
          !verifySvixSignature(webhookSecret, id, timestamp, body, signature)
        ) {
          return Response.json({ error: "Invalid signature" }, { status: 401 });
        }

        let event: ResendEvent;
        try {
          event = JSON.parse(body) as ResendEvent;
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }

        const type = event.type ?? "";
        const rawTo = event.data?.to;
        const email = (
          event.data?.email ??
          (Array.isArray(rawTo) ? rawTo[0] : rawTo) ??
          ""
        ).toLowerCase();
        if (!email)
          return Response.json({ ok: true, ignored: "no email in payload" });

        const isUnsubscribe =
          (type.startsWith("contact.") && event.data?.unsubscribed === true) ||
          type === "contact.deleted";
        const isHardFail =
          type === "email.bounced" || type === "email.complained";
        if (!isUnsubscribe && !isHardFail) {
          return Response.json({ ok: true, ignored: type });
        }

        const admin = createClient(supabaseUrl, serviceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const { data: directory } = await admin.rpc("admin_user_directory");
        const match = (
          (directory ?? []) as { id: string; email: string | null }[]
        ).find((u) => u.email?.toLowerCase() === email);

        if (match) {
          await admin
            .from("user_preferences")
            .update({
              marketing_emails_enabled: false,
              marketing_consent_updated_at: new Date().toISOString(),
            })
            .eq("user_id", match.id);
        }

        if (isHardFail) {
          await admin
            .from("suppressed_emails")
            .upsert({ email, reason: type }, { onConflict: "email" });
        }

        return Response.json({ ok: true, type, matchedUser: !!match });
      },
    },
  },
});
