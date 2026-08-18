/** Shared helpers for the unified notification bus. */

export type NotificationCategory =
  "deals" | "favorites" | "social" | "system" | "marketing";

export interface UserNotificationSettings {
  user_id: string;
  timezone: string;
  quiet_hours_enabled: boolean;
  quiet_hours_start: number;
  quiet_hours_end: number;
  categories: Record<string, boolean>;
}

/** Constant-time-ish string compare. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** HMAC-SHA256 hex digest. */
export async function hmacHex(
  secret: string,
  payload: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Verify the JET Bridge webhook. Accepts either:
 *  - `x-jet-signature: sha256=<hmac of raw body>` (preferred), or
 *  - a shared-secret header (legacy portal behaviour).
 */
export async function verifyBridgeAuth(
  req: Request,
  rawBody: string,
): Promise<boolean> {
  const secret = Deno.env.get("JETBRIDGE_WEBHOOK_SECRET");
  if (!secret) return false;

  const sigHeader =
    req.headers.get("x-jet-signature") ??
    req.headers.get("x-webhook-signature");
  if (sigHeader) {
    const provided = sigHeader
      .replace(/^sha256=/, "")
      .trim()
      .toLowerCase();
    const expected = await hmacHex(secret, rawBody);
    return safeEqual(provided, expected);
  }

  const shared =
    req.headers.get("x-webhook-secret") ??
    req.headers.get("jetbridge_webhook_secret") ??
    req.headers.get("jetbridge-webhook-secret") ??
    (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  return !!shared && safeEqual(shared, secret);
}

/** Current hour (0-23) for a user's IANA timezone. */
export function hourInTimezone(tz: string, at: Date = new Date()): number {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      hour12: false,
    });
    return Number(fmt.format(at));
  } catch {
    return at.getUTCHours();
  }
}

/** True when `at` falls inside the user's quiet-hours window. */
export function isQuietHours(
  s: UserNotificationSettings,
  at: Date = new Date(),
): boolean {
  if (!s.quiet_hours_enabled) return false;
  const h = hourInTimezone(s.timezone || "America/New_York", at);
  const { quiet_hours_start: start, quiet_hours_end: end } = s;
  if (start === end) return false;
  return start < end ? h >= start && h < end : h >= start || h < end;
}

/** Next time outside quiet hours (i.e. the window's end), as an ISO string. */
export function nextDeliverableAt(
  s: UserNotificationSettings,
  at: Date = new Date(),
): string {
  const h = hourInTimezone(s.timezone || "America/New_York", at);
  let hoursAhead = (s.quiet_hours_end - h + 24) % 24;
  if (hoursAhead === 0) hoursAhead = 1;
  return new Date(at.getTime() + hoursAhead * 3600_000).toISOString();
}

export const DEFAULT_SETTINGS: Omit<UserNotificationSettings, "user_id"> = {
  timezone: "America/New_York",
  quiet_hours_enabled: true,
  quiet_hours_start: 22,
  quiet_hours_end: 8,
  categories: {
    deals: true,
    favorites: true,
    social: true,
    system: true,
    marketing: false,
  },
};

/** Category opt-out check with sane defaults for unknown categories. */
export function categoryAllowed(
  s: UserNotificationSettings,
  category: string,
): boolean {
  const map = s.categories ?? {};
  if (Object.prototype.hasOwnProperty.call(map, category))
    return map[category] !== false;
  return category !== "marketing";
}

/** Canonical deep-link data payload shared by web SW and native tap handler. */
export function buildDataPayload(opts: {
  queueId: string;
  dealId?: string | null;
  venueId?: string | null;
  venueName?: string | null;
  layers?: string | null;
  url?: string | null;
  category?: string | null;
}): Record<string, string> {
  const url =
    opts.url ??
    (opts.dealId
      ? `https://www.jet-around.com/?deal=${encodeURIComponent(opts.dealId)}`
      : opts.venueId
        ? `https://www.jet-around.com/?venue=${encodeURIComponent(opts.venueId)}`
        : "https://www.jet-around.com/");
  return {
    notificationId: opts.queueId,
    dealId: opts.dealId ?? "",
    venueId: opts.venueId ?? "",
    venueName: opts.venueName ?? "",
    layers: opts.layers ?? "",
    category: opts.category ?? "deals",
    url,
  };
}
