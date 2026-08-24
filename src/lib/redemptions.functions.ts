import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { RedemptionAnalytics } from "./redemptions.server";

export type { RedemptionAnalytics } from "./redemptions.server";

export interface IssuedRedemption {
  code: string;
  status: string;
  dealId: string;
  dealTitle: string | null;
  venueName: string | null;
  dealActive: boolean;
  issuedAt: string;
  redeemedAt: string | null;
}

export interface RedeemResult {
  status: "redeemed" | "already_redeemed" | "void" | "not_found";
  code: string;
  dealTitle: string | null;
  venueName: string | null;
  redeemedAt: string | null;
  dealActive: boolean;
}

/** Issue (or return the existing) redemption code for the signed-in user. */
export const issueRedemptionCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { dealId: string }) => {
    const dealId = String(input?.dealId ?? "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(dealId)) throw new Error("Invalid deal id");
    return { dealId };
  })
  .handler(async ({ data, context }): Promise<IssuedRedemption> => {
    const { supabase, userId } = context;

    const { data: deal, error: dealError } = await supabase
      .from("deals")
      .select("id, title, venue_id, venue_name, active, expires_at")
      .eq("id", data.dealId)
      .maybeSingle();
    if (dealError) throw dealError;
    if (!deal) throw new Error("Deal not found");

    const dealActive =
      Boolean(deal.active) && new Date(deal.expires_at).getTime() > Date.now();

    const { data: existing, error: existingError } = await supabase
      .from("deal_redemptions")
      .select("code, status, issued_at, redeemed_at")
      .eq("deal_id", data.dealId)
      .eq("user_id", userId)
      .maybeSingle();
    if (existingError) throw existingError;

    if (existing) {
      return {
        code: existing.code,
        status: existing.status,
        dealId: deal.id,
        dealTitle: deal.title,
        venueName: deal.venue_name,
        dealActive,
        issuedAt: existing.issued_at,
        redeemedAt: existing.redeemed_at,
      };
    }

    const { generateRedemptionCode } = await import("./redemptionCode");
    const code = generateRedemptionCode();

    const { data: inserted, error: insertError } = await supabase
      .from("deal_redemptions")
      .insert({
        code,
        deal_id: deal.id,
        user_id: userId,
        venue_id: deal.venue_id,
        venue_name: deal.venue_name,
        deal_title: deal.title,
        status: "issued",
        deal_active_at_issue: dealActive,
      })
      .select("code, status, issued_at, redeemed_at")
      .single();
    if (insertError) throw insertError;

    return {
      code: inserted.code,
      status: inserted.status,
      dealId: deal.id,
      dealTitle: deal.title,
      venueName: deal.venue_name,
      dealActive,
      issuedAt: inserted.issued_at,
      redeemedAt: inserted.redeemed_at,
    };
  });

/** Staff-only: mark a scanned code redeemed and notify JET Bridge. */
export const redeemRedemptionCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { code: string }) => {
    const code = String(input?.code ?? "")
      .trim()
      .toUpperCase()
      .replace(/^JETRDM:/, "");
    if (!/^[A-Z0-9-]{6,32}$/.test(code)) throw new Error("Invalid code");
    return { code };
  })
  .handler(async ({ data, context }): Promise<RedeemResult> => {
    const { data: rows, error } = await context.supabase.rpc(
      "redeem_deal_code",
      { _code: data.code },
    );
    if (error) throw error;

    const row = Array.isArray(rows) ? rows[0] : rows;
    const result: RedeemResult = {
      status: (row?.status ?? "not_found") as RedeemResult["status"],
      code: data.code,
      dealTitle: row?.deal_title ?? null,
      venueName: row?.venue_name ?? null,
      redeemedAt: row?.redeemed_at ?? null,
      dealActive: Boolean(row?.deal_active),
    };

    if (result.status === "redeemed") {
      const { supabaseAdmin } = await import(
        "@/integrations/supabase/client.server"
      );
      const { notifyBridgeOfRedemption } = await import("./redemptions.server");
      await notifyBridgeOfRedemption(supabaseAdmin as never, {
        code: result.code,
        deal_id: row?.deal_id ?? null,
        deal_title: result.dealTitle,
        venue_name: result.venueName,
        redeemed_at: result.redeemedAt,
        deal_active: result.dealActive,
        redeemed_by: context.userId,
      });
    }

    return result;
  });

/** Admin-only redemption analytics rollup. */
export const getRedemptionAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RedemptionAnalytics> => {
    const { data: isAdmin, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (error) throw error;
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { collectRedemptionAnalytics } = await import("./redemptions.server");
    return collectRedemptionAnalytics(supabaseAdmin as never);
  });
