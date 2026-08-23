/**
 * Crash reporting for edge functions.
 *
 * Payment and auth functions previously only `console.log`ed, so a failure was
 * invisible unless someone happened to be reading logs. This module forwards
 * unhandled exceptions to Sentry using the plain HTTP envelope endpoint — no
 * SDK dependency, no cold-start cost, and it degrades to structured console
 * output when `SENTRY_DSN` is not configured.
 *
 * Never pass raw request bodies or auth headers into `extra`; scrub first.
 */

interface ParsedDsn {
  envelopeUrl: string;
  publicKey: string;
}

function parseDsn(dsn: string): ParsedDsn | null {
  try {
    const url = new URL(dsn);
    const projectId = url.pathname.replace(/^\//, "");
    if (!projectId || !url.username) return null;
    return {
      envelopeUrl: `${url.protocol}//${url.host}/api/${projectId}/envelope/`,
      publicKey: url.username,
    };
  } catch {
    return null;
  }
}

const DSN = Deno.env.get("SENTRY_DSN") ?? "";
const parsed = DSN ? parseDsn(DSN) : null;
const ENVIRONMENT = Deno.env.get("SENTRY_ENVIRONMENT") ?? "production";

export const isCrashReportingEnabled = () => parsed !== null;

function errorParts(error: unknown): { type: string; value: string } {
  if (error instanceof Error) {
    return { type: error.name || "Error", value: error.message };
  }
  return { type: "UnknownError", value: String(error) };
}

/**
 * Report a caught error. Always resolves — reporting must never mask the
 * original failure or add a new one.
 */
export async function reportEdgeError(
  functionName: string,
  error: unknown,
  extra?: Record<string, unknown>,
): Promise<void> {
  const { type, value } = errorParts(error);
  const stack = error instanceof Error ? error.stack : undefined;

  // Always leave a structured breadcrumb in the function logs, whether or not
  // Sentry is wired up.
  console.error(
    JSON.stringify({
      level: "error",
      fn: functionName,
      type,
      message: value,
      stack,
      ...(extra ?? {}),
    }),
  );

  if (!parsed) return;

  try {
    const eventId = crypto.randomUUID().replace(/-/g, "");
    const header = JSON.stringify({
      event_id: eventId,
      sent_at: new Date().toISOString(),
ețai: undefined,
    });
    const itemHeader = JSON.stringify({ type: "event" });
    const payload = JSON.stringify({
      event_id: eventId,
      timestamp: Date.now() / 1000,
      platform: "javascript",
      level: "error",
      environment: ENVIRONMENT,
      server_name: functionName,
      tags: { edge_function: functionName, runtime: "deno" },
      extra,
      exception: {
        values: [
          {
            type,
            value,
            stacktrace: stack ? { frames: [{ filename: stack }] } : undefined,
          },
        ],
      },
    });

    await fetch(parsed.envelopeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-sentry-envelope",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_client=jet-edge/1.0, sentry_key=${parsed.publicKey}`,
      },
      body: `${header}\n${itemHeader}\n${payload}\n`,
    });
  } catch (reportingError) {
    console.error("[observability] failed to report to Sentry", reportingError);
  }
}

/**
 * Wrap a `Deno.serve` handler so any thrown error is reported before the
 * generic 500 goes back to the caller.
 */
export function withCrashReporting(
  functionName: string,
  handler: (req: Request) => Promise<Response>,
  corsHeaders: Record<string, string> = {},
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    try {
      return await handler(req);
    } catch (error) {
      await reportEdgeError(functionName, error, {
        method: req.method,
        path: new URL(req.url).pathname,
      });
      return new Response(
        JSON.stringify({ error: "Internal server error" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
  };
}
