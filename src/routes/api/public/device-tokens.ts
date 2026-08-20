/**
 * Raw HTTP endpoint for registering Capacitor iOS/Android push tokens.
 *
 * Lives under /api/public/* so the native shell (and curl, during testing) can
 * reach it without the published-site auth gate — the handler authenticates
 * every request itself with the caller's Supabase bearer token and only ever
 * touches rows owned by that user (RLS applies; no service role here).
 *
 *   POST   /api/public/device-tokens  { token, platform, previousToken?, deviceId? }
 *   GET    /api/public/device-tokens  -> this user's native tokens (masked)
 *   DELETE /api/public/device-tokens  { token }  -> deactivate
 */
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  DeviceTokenError,
  deactivateDeviceTokenFor,
  listDeviceTokensFor,
  maskToken,
  registerDeviceTokenFor,
  validateDeviceToken,
} from "@/lib/device-tokens.server";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...cors },
  });
}

/** Same `{ error, code }` envelope the edge functions return. */
const codeForStatus = (status: number): string => {
  switch (status) {
    case 400:
      return "INVALID_INPUT";
    case 401:
      return "UNAUTHORIZED";
    case 403:
      return "FORBIDDEN";
    case 404:
      return "NOT_FOUND";
    case 409:
      return "CONFLICT";
    case 429:
      return "RATE_LIMITED";
    default:
      return status >= 500 ? "INTERNAL_ERROR" : "INVALID_INPUT";
  }
};

const jsonError = (status: number, message: string, code?: string) =>
  json(
    { success: false, error: message, code: code ?? codeForStatus(status) },
    status,
  );

async function authenticate(request: Request) {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new DeviceTokenError("Backend not configured", 500);

  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token || token.split(".").length !== 3) {
    throw new DeviceTokenError("Unauthorized", 401);
  }

  const supabase = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}`, apikey: key } },
  });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) throw new DeviceTokenError("Unauthorized", 401);
  return { supabase, userId: data.user.id };
}

async function handle(
  request: Request,
  run: (ctx: Awaited<ReturnType<typeof authenticate>>) => Promise<Response>,
) {
  try {
    return await run(await authenticate(request));
  } catch (err) {
    if (err instanceof DeviceTokenError) {
      return jsonError(err.status, err.message);
    }
    console.error("[device-tokens] unexpected error", err);
    return jsonError(500, "Internal server error", "INTERNAL_ERROR");
  }
}

async function readBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new DeviceTokenError("Invalid JSON body");
  }
}

export const Route = createFileRoute("/api/public/device-tokens")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),

      GET: async ({ request }) =>
        handle(request, async ({ supabase, userId }) => {
          const rows = await listDeviceTokensFor(supabase, userId);
          return json({
            tokens: rows.map((r) => ({ ...r, endpoint: maskToken(r.endpoint) })),
          });
        }),

      POST: async ({ request }) =>
        handle(request, async ({ supabase, userId }) => {
          const input = validateDeviceToken(await readBody(request));
          const result = await registerDeviceTokenFor(supabase, userId, input);
          return json(
            {
              ok: true,
              id: result.id,
              created: result.created,
              rotatedFrom: result.rotatedFrom ? maskToken(result.rotatedFrom) : null,
              platform: input.platform,
              token: maskToken(input.token),
            },
            result.created ? 201 : 200,
          );
        }),

      DELETE: async ({ request }) =>
        handle(request, async ({ supabase, userId }) => {
          const body = (await readBody(request)) as { token?: unknown };
          const token = typeof body.token === "string" ? body.token.trim() : "";
          if (!token) throw new DeviceTokenError("token is required");
          const result = await deactivateDeviceTokenFor(supabase, userId, token);
          return json({ ok: true, ...result });
        }),
    },
  },
});
