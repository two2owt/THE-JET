import type {
  ToolContext,
  ToolDefinition,
  ZodRawShape,
} from "@lovable.dev/mcp-js";

type RuntimeGlobals = typeof globalThis & {
  Deno?: { env?: { get?: (name: string) => string | undefined } };
  process?: { env?: Record<string, string | undefined> };
};

function env(name: string): string | undefined {
  const runtime = globalThis as RuntimeGlobals;
  return runtime.Deno?.env?.get?.(name) ?? runtime.process?.env?.[name];
}

/** Coarse deployment label so Test vs Live logs are distinguishable. */
function environmentLabel(): string {
  return (
    env("LOVABLE_ENVIRONMENT") ??
    env("SUPABASE_ENVIRONMENT") ??
    env("ENVIRONMENT") ??
    "unknown"
  );
}

/** Emit a single JSON line; edge function logs are line-oriented. */
function emit(
  level: "info" | "warn" | "error",
  event: string,
  fields: Record<string, unknown>,
) {
  const line = JSON.stringify({
    source: "mcp",
    event,
    level,
    env: environmentLabel(),
    at: new Date().toISOString(),
    ...fields,
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/**
 * Summarizes the verified JWT for a request. Never includes the raw token —
 * only verification outcome and non-sensitive claim metadata.
 */
function authSummary(ctx: ToolContext) {
  const authenticated = ctx.isAuthenticated();
  if (!authenticated) {
    return {
      authenticated: false as const,
      jwt_verified: false as const,
      reason: "no_verified_token",
    };
  }
  const claims = ctx.getClaims() as Record<string, unknown> | undefined;
  const exp =
    typeof claims?.exp === "number" ? (claims.exp as number) : undefined;
  return {
    authenticated: true as const,
    jwt_verified: true as const,
    user_id: ctx.getUserId() ?? null,
    issuer: ctx.getIssuer() ?? null,
    audience: (claims?.aud as unknown) ?? null,
    client_id: ctx.getClientId() ?? null,
    scopes: ctx.getScopes() ?? null,
    token_role: (claims?.role as unknown) ?? null,
    expires_at: exp ? new Date(exp * 1000).toISOString() : null,
    seconds_to_expiry: exp ? exp - Math.floor(Date.now() / 1000) : null,
  };
}

let requestSeq = 0;

/**
 * Wraps a tool handler with structured request / JWT-verification / outcome
 * logging so 401s and auth drift are visible in edge function logs.
 */
export function withLogging<
  TInput extends ZodRawShape | undefined,
  TOutput extends ZodRawShape | undefined,
>(tool: ToolDefinition<TInput, TOutput>): ToolDefinition<TInput, TOutput> {
  const handler = tool.handler as (
    input: unknown,
    ctx: ToolContext,
  ) => Promise<unknown>;
  return {
    ...tool,
    handler: (async (input: unknown, ctx: ToolContext) => {
      const requestId = `${Date.now().toString(36)}-${(requestSeq = (requestSeq + 1) % 1_000_000).toString(36)}`;
      const auth = authSummary(ctx);
      const started = Date.now();

      emit(auth.authenticated ? "info" : "warn", "mcp_tool_request", {
        request_id: requestId,
        tool: tool.name,
        input_keys:
          input && typeof input === "object"
            ? Object.keys(input as object)
            : [],
        ...auth,
      });

      if (!auth.authenticated) {
        emit("warn", "mcp_auth_rejected", {
          request_id: requestId,
          tool: tool.name,
          http_equivalent: 401,
          detail:
            "Tool invoked without a verified OAuth bearer token (JWT missing, expired, or failed issuer/audience verification).",
        });
      }

      try {
        const result = (await handler(input, ctx)) as
          { isError?: boolean } | undefined;
        const isError = Boolean(result?.isError);
        emit(isError ? "warn" : "info", "mcp_tool_result", {
          request_id: requestId,
          tool: tool.name,
          ok: !isError,
          authenticated: auth.authenticated,
          duration_ms: Date.now() - started,
        });
        return result;
      } catch (error) {
        emit("error", "mcp_tool_exception", {
          request_id: requestId,
          tool: tool.name,
          authenticated: auth.authenticated,
          duration_ms: Date.now() - started,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    }) as ToolDefinition<TInput, TOutput>["handler"],
  };
}

/** Logged once at cold start so manifest/auth config drift is greppable. */
export function logServerBoot(info: {
  name: string;
  version: string;
  issuer: string;
  toolCount: number;
}) {
  emit("info", "mcp_server_boot", {
    server: info.name,
    version: info.version,
    issuer: info.issuer,
    tool_count: info.toolCount,
    supabase_url_configured: Boolean(
      env("SUPABASE_URL") ?? env("VITE_SUPABASE_URL"),
    ),
  });
}
