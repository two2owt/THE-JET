/**
 * Server-only helpers for deal redemptions.
 *
 * Handles the outbound JET Bridge notification so merchant dashboards stay
 * in sync, plus the admin analytics rollup.
 */

type AdminClient = {
  from: (table: string) => any;
};

export interface RedemptionAnalytics {
  totals: {
    issued: number;
    redeemed: number;
    redeemedToday: number;
    redeemedInactive: number;
    redemptionRate: number;
  };
  byDeal: Array<{
    deal_id: string;
    deal_title: string | null;
    venue_name: string | null;
    issued: number;
    redeemed: number;
    lastRedeemedAt: string | null;
  }>;
  daily: Array<{ date: string; redeemed: number }>;
  recent: Array<{
    id: string;
    code: string;
    deal_title: string | null;
    venue_name: string | null;
    status: string;
    redeemed_at: string | null;
    issued_at: string;
    deal_active_at_redemption: boolean | null;
  }>;
}

const BRIDGE_CONFIG_KEY = "jetbridge_redemption_webhook_url";

/** Best-effort push of a redemption event to JET Bridge merchant dashboards. */
export async function notifyBridgeOfRedemption(
  admin: AdminClient,
  payload: Record<string, unknown>,
): Promise<{ delivered: boolean; reason?: string }> {
  try {
    const { data } = await admin
      .from("app_config")
      .select("value")
      .eq("key", BRIDGE_CONFIG_KEY)
      .maybeSingle();

    const raw = data?.value;
    const url =
      typeof raw === "string" ? raw : (raw?.url ?? raw?.value ?? null);
    if (!url || typeof url !== "string" || !url.startsWith("https://")) {
      return { delivered: false, reason: "not_configured" };
    }

    const secret = process.env["JETBRIDGE_WEBHOOK_SECRET"] ?? "";
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(secret ? { "x-webhook-secret": secret } : {}),
      },
      body: JSON.stringify({ event: "deal.redeemed", ...payload }),
    });
    return res.ok
      ? { delivered: true }
      : { delivered: false, reason: `http_${res.status}` };
  } catch (err) {
    return {
      delivered: false,
      reason: err instanceof Error ? err.message : "error",
    };
  }
}

export async function collectRedemptionAnalytics(
  admin: AdminClient,
): Promise<RedemptionAnalytics> {
  const { data, error } = await admin
    .from("deal_redemptions")
    .select(
      "id, code, deal_id, deal_title, venue_name, status, issued_at, redeemed_at, deal_active_at_redemption",
    )
    .order("issued_at", { ascending: false })
    .limit(5000);

  if (error) throw error;

  const rows: Array<{
    id: string;
    code: string;
    deal_id: string;
    deal_title: string | null;
    venue_name: string | null;
    status: string;
    issued_at: string;
    redeemed_at: string | null;
    deal_active_at_redemption: boolean | null;
  }> = data ?? [];

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  let redeemed = 0;
  let redeemedToday = 0;
  let redeemedInactive = 0;
  const perDeal = new Map<string, RedemptionAnalytics["byDeal"][number]>();
  const perDay = new Map<string, number>();

  for (const row of rows) {
    const isRedeemed = row.status === "redeemed";
    if (isRedeemed) {
      redeemed += 1;
      if (row.deal_active_at_redemption === false) redeemedInactive += 1;
      if (row.redeemed_at && new Date(row.redeemed_at) >= startOfToday) {
        redeemedToday += 1;
      }
      if (row.redeemed_at) {
        const day = row.redeemed_at.slice(0, 10);
        perDay.set(day, (perDay.get(day) ?? 0) + 1);
      }
    }

    const entry = perDeal.get(row.deal_id) ?? {
      deal_id: row.deal_id,
      deal_title: row.deal_title,
      venue_name: row.venue_name,
      issued: 0,
      redeemed: 0,
      lastRedeemedAt: null as string | null,
    };
    entry.issued += 1;
    if (isRedeemed) {
      entry.redeemed += 1;
      if (
        row.redeemed_at &&
        (!entry.lastRedeemedAt || row.redeemed_at > entry.lastRedeemedAt)
      ) {
        entry.lastRedeemedAt = row.redeemed_at;
      }
    }
    perDeal.set(row.deal_id, entry);
  }

  const daily: RedemptionAnalytics["daily"] = [];
  for (let i = 13; i >= 0; i -= 1) {
    const d = new Date(startOfToday);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    daily.push({ date: key, redeemed: perDay.get(key) ?? 0 });
  }

  return {
    totals: {
      issued: rows.length,
      redeemed,
      redeemedToday,
      redeemedInactive,
      redemptionRate: rows.length ? redeemed / rows.length : 0,
    },
    byDeal: Array.from(perDeal.values())
      .sort((a, b) => b.redeemed - a.redeemed || b.issued - a.issued)
      .slice(0, 25),
    daily,
    recent: rows.slice(0, 25).map((r) => ({
      id: r.id,
      code: r.code,
      deal_title: r.deal_title,
      venue_name: r.venue_name,
      status: r.status,
      redeemed_at: r.redeemed_at,
      issued_at: r.issued_at,
      deal_active_at_redemption: r.deal_active_at_redemption,
    })),
  };
}
