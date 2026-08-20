/**
 * FCM HTTP v1 client.
 *
 * The legacy `https://fcm.googleapis.com/fcm/send` endpoint was shut down by
 * Google in 2024, so native pushes must go through HTTP v1 with an OAuth2
 * access token minted from a service-account key.
 *
 * Secret: FCM_SERVICE_ACCOUNT_JSON — the full service-account JSON blob.
 */

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

function b64url(input: ArrayBuffer | string): string {
  const bytes =
    typeof input === "string"
      ? new TextEncoder().encode(input)
      : new Uint8Array(input);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const raw = atob(body);
  const buf = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
  return buf.buffer;
}

export function getServiceAccount(): ServiceAccount | null {
  const raw = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ServiceAccount;
    if (!parsed.client_email || !parsed.private_key || !parsed.project_id)
      return null;
    parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
    return parsed;
  } catch {
    return null;
  }
}

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt - 60 > now) return cachedToken.token;

  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const signingInput = `${header}.${claims}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput),
  );
  const jwt = `${signingInput}.${b64url(sig)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) {
    throw new Error(`fcm oauth failed: ${res.status} ${JSON.stringify(json)}`);
  }
  cachedToken = {
    token: json.access_token as string,
    expiresAt: now + (json.expires_in ?? 3600),
  };
  return cachedToken.token;
}

export interface FcmSendResult {
  ok: boolean;
  /** Set when the token should be deactivated. */
  unregistered: boolean;
  error?: string;
  /** HTTP status returned by FCM (0 when the request never left). */
  httpStatus?: number;
  /** `projects/<id>/messages/<id>` returned by FCM on success. */
  messageId?: string;
}

/** Send a single notification via FCM HTTP v1. */
export interface FcmConfigReport {
  configured: boolean;
  projectId: string | null;
  clientEmail: string | null;
  oauthStatus: number | null;
  /** Status of a `validate_only` probe against FCM HTTP v1. */
  v1Status: number | null;
  v1Error?: string;
  /** True when HTTP v1 answered (400 INVALID_ARGUMENT on the fake token is expected). */
  v1Enabled: boolean;
}

/**
 * Diagnostic: confirms which Firebase project the service account targets and
 * whether the Cloud Messaging API (V1) is enabled for it. Sends nothing —
 * the probe uses `validate_only` with a deliberately invalid token.
 */
export async function describeFcmConfig(): Promise<FcmConfigReport> {
  const sa = getServiceAccount();
  if (!sa)
    return {
      configured: false,
      projectId: null,
      clientEmail: null,
      oauthStatus: null,
      v1Status: null,
      v1Enabled: false,
      v1Error: "FCM_SERVICE_ACCOUNT_JSON missing or malformed",
    };

  let accessToken = "";
  try {
    accessToken = await getAccessToken(sa);
  } catch (e) {
    return {
      configured: true,
      projectId: sa.project_id,
      clientEmail: sa.client_email,
      oauthStatus: 0,
      v1Status: null,
      v1Enabled: false,
      v1Error: String(e).slice(0, 300),
    };
  }

  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        validate_only: true,
        message: {
          token: "DIAGNOSTIC_INVALID_TOKEN",
          notification: { title: "diagnostic", body: "diagnostic" },
        },
      }),
    },
  );
  const text = await res.text().catch(() => "");
  return {
    configured: true,
    projectId: sa.project_id,
    clientEmail: sa.client_email,
    oauthStatus: 200,
    v1Status: res.status,
    // 403 SERVICE_DISABLED / PERMISSION_DENIED means the API is off for the project.
    v1Enabled: res.status !== 403 && res.status !== 404,
    v1Error: res.ok ? undefined : text.slice(0, 300),
  };
}

export async function sendFcmV1(
  deviceToken: string,
  notification: { title: string; body: string },
  data: Record<string, string>,
): Promise<FcmSendResult> {
  const sa = getServiceAccount();
  if (!sa)
    return {
      ok: false,
      unregistered: false,
      error: "FCM_SERVICE_ACCOUNT_JSON not configured",
      httpStatus: 0,
    };

  const accessToken = await getAccessToken(sa);
  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token: deviceToken.replace(/^fcm:/, ""),
          notification,
          data,
          android: { priority: "HIGH", notification: { sound: "default" } },
          apns: {
            headers: { "apns-priority": "10" },
            payload: { aps: { sound: "default", badge: 1 } },
          },
        },
      }),
    },
  );

  if (res.ok) {
    let messageId: string | undefined;
    try {
      messageId = (await res.json())?.name;
    } catch {
      /* body is optional for our purposes */
    }
    return { ok: true, unregistered: false, httpStatus: res.status, messageId };
  }

  const text = await res.text().catch(() => "");
  const unregistered =
    res.status === 404 ||
    text.includes("UNREGISTERED") ||
    (text.includes("INVALID_ARGUMENT") && text.includes("token"));
  return {
    ok: false,
    unregistered,
    error: `fcm ${res.status} ${text.slice(0, 300)}`,
    httpStatus: res.status,
  };
}
