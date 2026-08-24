/**
 * Server-side sink for auth redirect diagnostics.
 *
 * Auth redirect failures happen while the user has NO session (expired reset
 * link, dropped hash, missing route), so this endpoint has to be public. It is
 * therefore strictly write-only, schema-validated, size-capped, and it only
 * accepts the sanitized metadata shape produced by
 * `src/lib/authRedirectLog.ts` — token values are rejected outright rather
 * than stored.
 *
 * Rows land in `security_audit_logs` (event_type `auth_redirect_*`) so the
 * admin panel can surface them next to other auth telemetry.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const STAGES = [
  "alias_redirect",
  "alias_token_loss",
  "not_found",
  "callback_no_session",
  "recovery_link_error",
  "verification_link_error",
  "session_exchange_failed",
] as const;

/** Token maps are `key -> length`: a string value would mean a leaked token. */
const tokenLengths = z.record(z.string(), z.number().int().min(0).max(8192));

const payloadSchema = z.object({
  stage: z.enum(STAGES),
  from: z.string().max(300),
  to: z.string().max(300).nullable().optional(),
  errorCode: z.string().max(120).nullable().optional(),
  errorDescription: z.string().max(300).nullable().optional(),
  detail: z.string().max(300).nullable().optional(),
  hashTokens: tokenLengths.optional(),
  queryTokens: tokenLengths.optional(),
  hashParams: z.record(z.string(), z.string().max(120)).optional(),
  queryParams: z.record(z.string(), z.string().max(120)).optional(),
  hasSession: z.boolean().optional(),
  userAgent: z.string().max(300).optional(),
  referrerOrigin: z.string().max(200).nullable().optional(),
  at: z.string().max(40).optional(),
});

const MAX_BODY_BYTES = 4096;

/** Only the path — a full URL could smuggle a token in the query/hash. */
const pathOnly = (value: string): string => value.split("#")[0].split("?")[0];

export const Route = createFileRoute("/api/public/auth-redirect-log")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        if (raw.length > MAX_BODY_BYTES) {
          return new Response("Payload too large", { status: 413 });
        }

        let parsed: z.infer<typeof payloadSchema>;
        try {
          parsed = payloadSchema.parse(JSON.parse(raw));
        } catch {
          return new Response("Invalid payload", { status: 400 });
        }

        const clientIp =
          request.headers.get("cf-connecting-ip") ??
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          "unknown";

        const details = {
          stage: parsed.stage,
          from: pathOnly(parsed.from),
          to: parsed.to ? pathOnly(parsed.to) : null,
          errorCode: parsed.errorCode ?? null,
          errorDescription: parsed.errorDescription ?? null,
          detail: parsed.detail ?? null,
          // Which auth params existed, never their values.
          hashTokenKeys: Object.keys(parsed.hashTokens ?? {}),
          queryTokenKeys: Object.keys(parsed.queryTokens ?? {}),
          hashParams: parsed.hashParams ?? {},
          queryParams: parsed.queryParams ?? {},
          hasSession: parsed.hasSession ?? false,
          referrerOrigin: parsed.referrerOrigin ?? null,
          clientAt: parsed.at ?? null,
        };

        // Server log line: greppable in deployment logs even if the DB write
        // fails, which matters most when the failure IS the database.
        console.warn("[auth-redirect]", JSON.stringify(details));

        try {
          const { supabaseAdmin } = await import(
            "@/integrations/supabase/client.server"
          );
          await supabaseAdmin.from("security_audit_logs").insert({
            event_type: `auth_redirect_${parsed.stage}`,
            endpoint: details.from,
            client_ip: clientIp,
            user_agent: parsed.userAgent ?? request.headers.get("user-agent"),
            details,
          });
        } catch (error) {
          console.error("[auth-redirect] persist failed", error);
        }

        // Always 204: the client must never retry or surface this to the user.
        return new Response(null, { status: 204 });
      },
    },
  },
});
