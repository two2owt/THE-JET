/**
 * Server-only logic for registering Capacitor (APNs / FCM) device tokens into
 * `push_subscriptions`.
 *
 * Native tokens reuse the web-push table: `endpoint` holds the raw device
 * token and the `p256dh_key` / `auth_key` columns carry the literal string
 * "native" (they only mean something for the Web Push encryption envelope).
 * `platform` is "ios" or "android" so `notifications-dispatch` can pick the
 * FCM HTTP v1 path instead of Web Push.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type NativePlatform = "ios" | "android";

export type DeviceTokenInput = {
  token: string;
  platform: NativePlatform;
  /** Token this device previously registered, when APNs/FCM rotated it. */
  previousToken?: string | null;
};

export type DeviceTokenRow = {
  id: string;
  endpoint: string;
  platform: string;
  active: boolean;
  created_at: string | null;
  updated_at: string | null;
};

export class DeviceTokenError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/** APNs hex tokens and FCM registration ids differ wildly; keep bounds loose. */
export function validateDeviceToken(input: unknown): DeviceTokenInput {
  const raw = (input ?? {}) as Record<string, unknown>;
  const token = typeof raw.token === "string" ? raw.token.trim() : "";
  const platform = raw.platform;
  const previousToken =
    typeof raw.previousToken === "string" && raw.previousToken.trim()
      ? raw.previousToken.trim()
      : null;

  if (token.length < 16 || token.length > 4096) {
    throw new DeviceTokenError(
      "token must be a device token between 16 and 4096 characters",
    );
  }
  if (/\s/.test(token)) {
    throw new DeviceTokenError("token must not contain whitespace");
  }
  if (platform !== "ios" && platform !== "android") {
    throw new DeviceTokenError('platform must be "ios" or "android"');
  }

  return { token, platform, previousToken };
}

type Client = SupabaseClient<Database>;

/**
 * Idempotent find-or-update — there is no unique constraint on `endpoint`,
 * so a blind upsert would fan out duplicate rows per re-registration.
 */
export async function registerDeviceTokenFor(
  supabase: Client,
  userId: string,
  input: DeviceTokenInput,
): Promise<{ id: string; rotatedFrom: string | null; created: boolean }> {
  const { token, platform, previousToken } = input;
  let rotatedFrom: string | null = null;

  // --- Rotation: retire or rewrite the superseded row for this device ----
  if (previousToken && previousToken !== token) {
    const { data: existingNew } = await supabase
      .from("push_subscriptions")
      .select("id")
      .eq("endpoint", token)
      .eq("user_id", userId)
      .maybeSingle();

    if (existingNew?.id) {
      await supabase
        .from("push_subscriptions")
        .delete()
        .eq("endpoint", previousToken)
        .eq("user_id", userId);
    } else {
      const { data: moved } = await supabase
        .from("push_subscriptions")
        .update({
          endpoint: token,
          platform,
          active: true,
          updated_at: new Date().toISOString(),
        })
        .eq("endpoint", previousToken)
        .eq("user_id", userId)
        .select("id");
      if (moved && moved.length > 0) rotatedFrom = previousToken;
    }
  }

  const { data: existing, error: findError } = await supabase
    .from("push_subscriptions")
    .select("id")
    .eq("endpoint", token)
    .eq("user_id", userId)
    .maybeSingle();
  if (findError) throw new DeviceTokenError(findError.message, 500);

  if (existing?.id) {
    const { error } = await supabase
      .from("push_subscriptions")
      .update({
        platform,
        active: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (error) throw new DeviceTokenError(error.message, 500);
    return { id: existing.id, rotatedFrom, created: false };
  }

  const { data: inserted, error } = await supabase
    .from("push_subscriptions")
    .insert({
      user_id: userId,
      endpoint: token,
      p256dh_key: "native",
      auth_key: "native",
      platform,
      active: true,
    })
    .select("id")
    .single();
  if (error) throw new DeviceTokenError(error.message, 500);

  return { id: inserted.id, rotatedFrom, created: true };
}

export async function deactivateDeviceTokenFor(
  supabase: Client,
  userId: string,
  token: string,
): Promise<{ deactivated: number }> {
  const { data, error } = await supabase
    .from("push_subscriptions")
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq("endpoint", token)
    .eq("user_id", userId)
    .select("id");
  if (error) throw new DeviceTokenError(error.message, 500);
  return { deactivated: data?.length ?? 0 };
}

export async function deactivateDeviceTokenByIdFor(
  supabase: Client,
  userId: string,
  id: string,
): Promise<{ deactivated: number }> {
  const { data, error } = await supabase
    .from("push_subscriptions")
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId)
    .select("id");
  if (error) throw new DeviceTokenError(error.message, 500);
  return { deactivated: data?.length ?? 0 };
}

export async function listDeviceTokensFor(
  supabase: Client,
  userId: string,
): Promise<DeviceTokenRow[]> {
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, platform, active, created_at, updated_at")
    .eq("user_id", userId)
    .in("platform", ["ios", "android"])
    .order("updated_at", { ascending: false });
  if (error) throw new DeviceTokenError(error.message, 500);
  return (data ?? []) as DeviceTokenRow[];
}

/** Never echo a full device token back to the client. */
export function maskToken(token: string): string {
  if (token.length <= 12) return `${token.slice(0, 4)}…`;
  return `${token.slice(0, 6)}…${token.slice(-4)}`;
}
