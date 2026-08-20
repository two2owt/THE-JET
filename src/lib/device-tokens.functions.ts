import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  deactivateDeviceTokenFor,
  listDeviceTokensFor,
  maskToken,
  registerDeviceTokenFor,
  validateDeviceToken,
  type DeviceTokenInput,
} from "./device-tokens.server";

export const registerDeviceToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown): DeviceTokenInput =>
    validateDeviceToken(data),
  )
  .handler(async ({ data, context }) => {
    const result = await registerDeviceTokenFor(
      context.supabase,
      context.userId,
      data,
    );
    return { ...result, token: maskToken(data.token), platform: data.platform };
  });

export const deactivateDeviceToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { token: string }) => ({
    token: String(data?.token ?? "").trim(),
  }))
  .handler(async ({ data, context }) =>
    deactivateDeviceTokenFor(context.supabase, context.userId, data.token),
  );

export const listMyDeviceTokens = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const rows = await listDeviceTokensFor(context.supabase, context.userId);
    return rows.map((r) => ({ ...r, endpoint: maskToken(r.endpoint) }));
  });
