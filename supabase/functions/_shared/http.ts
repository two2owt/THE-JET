/**
 * Shared HTTP response contract for JET edge functions.
 *
 * Every non-2xx response returned by the map / geofence / push endpoints uses
 * the exact same JSON envelope so clients can branch on a stable machine
 * readable `code` instead of parsing prose or plain-text bodies:
 *
 *   { "error": "human readable message", "code": "MACHINE_CODE", "detail"?: "…", "success": false }
 *
 * `success: false` is kept for backwards compatibility with older clients that
 * checked that flag; new code should read `code`.
 */
import { corsHeaders } from "./cors.ts";

/** Canonical machine-readable error codes. */
export const ErrorCode = {
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  INVALID_JSON: "INVALID_JSON",
  INVALID_INPUT: "INVALID_INPUT",
  NOT_FOUND: "NOT_FOUND",
  METHOD_NOT_ALLOWED: "METHOD_NOT_ALLOWED",
  RATE_LIMITED: "RATE_LIMITED",
  UPSTREAM_ERROR: "UPSTREAM_ERROR",
  NOT_CONFIGURED: "NOT_CONFIGURED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

const JSON_HEADERS = { ...corsHeaders, "Content-Type": "application/json" };

/** Success (or any explicit-status) JSON body. */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

/** Standard error envelope. */
export function errorResponse(
  status: number,
  code: ErrorCodeValue,
  message: string,
  detail?: string,
): Response {
  return jsonResponse(
    { success: false, error: message, code, ...(detail ? { detail } : {}) },
    status,
  );
}

export const unauthorized = (message = "Unauthorized", detail?: string) =>
  errorResponse(401, ErrorCode.UNAUTHORIZED, message, detail);

export const forbidden = (message = "Forbidden", detail?: string) =>
  errorResponse(403, ErrorCode.FORBIDDEN, message, detail);

export const invalidInput = (message: string, detail?: string) =>
  errorResponse(400, ErrorCode.INVALID_INPUT, message, detail);

export const invalidJson = (message = "Invalid JSON body") =>
  errorResponse(400, ErrorCode.INVALID_JSON, message);

export const rateLimited = (
  message = "Too many requests. Please try again later.",
) => errorResponse(429, ErrorCode.RATE_LIMITED, message);

export const notConfigured = (message: string) =>
  errorResponse(503, ErrorCode.NOT_CONFIGURED, message);

export const upstreamError = (message: string, detail?: string) =>
  errorResponse(502, ErrorCode.UPSTREAM_ERROR, message, detail);

/** 500 fallback. The user-facing message stays generic; details go in `detail`. */
export function internalError(err: unknown, message = "Internal server error") {
  const detail =
    err instanceof Error ? err.message : err ? String(err) : undefined;
  return errorResponse(
    500,
    ErrorCode.INTERNAL_ERROR,
    message,
    detail?.slice(0, 500),
  );
}

/** Throwable that maps onto the envelope in a catch block. */
export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: ErrorCodeValue = ErrorCode.INTERNAL_ERROR,
    readonly detail?: string,
  ) {
    super(message);
  }
}

/** Turn any thrown value into a standard error response. */
export function toErrorResponse(err: unknown): Response {
  if (err instanceof HttpError) {
    return errorResponse(err.status, err.code, err.message, err.detail);
  }
  return internalError(err);
}
