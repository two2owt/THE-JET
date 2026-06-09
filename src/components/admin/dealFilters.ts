import type { Database } from "@/integrations/supabase/types";

type Deal = Database["public"]["Tables"]["deals"]["Row"];

/** URL keys owned by the deal facet UI. Any others on the URL are preserved untouched. */
export const FILTER_KEYS = [
  "q",
  "types",
  "status",
  "from",
  "to",
  "priority",
  "merchants",
  "neighborhoods",
  "days",
] as const;

export type Priority = "high" | "medium" | "low";
export const PRIORITY_OPTIONS: Priority[] = ["high", "medium", "low"];

export const STATUS_VALUES = ["all", "active", "inactive", "expired", "upcoming"] as const;
export type Status = (typeof STATUS_VALUES)[number];

export const NONE_KEY = "__none__";
export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export interface Filters {
  q: string;
  types: string[];
  status: Status;
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
  priority: Priority[];
  merchants: string[];
  neighborhoods: string[];
  days: number[]; // 0=Sun..6=Sat
}

export const defaultFilters: Filters = {
  q: "",
  types: [],
  status: "all",
  from: "",
  to: "",
  priority: [],
  merchants: [],
  neighborhoods: [],
  days: [],
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDateString(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const d = new Date(value);
  return !Number.isNaN(d.getTime());
}

/** Split a CSV param, trim, drop empties, and dedupe — order-preserving. */
function csvList(raw: string | null): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const t = part.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/**
 * Parse URL search params into a strongly-typed `Filters` object.
 * Invalid / unknown values are silently dropped so the UI never desyncs from the URL.
 */
export function readFilters(params: URLSearchParams): Filters {
  const rawStatus = params.get("status");
  const status: Status =
    rawStatus && (STATUS_VALUES as readonly string[]).includes(rawStatus)
      ? (rawStatus as Status)
      : "all";

  const priority = csvList(params.get("priority")).filter(
    (p): p is Priority => (PRIORITY_OPTIONS as string[]).includes(p),
  );

  const days: number[] = [];
  const seenDays = new Set<number>();
  for (const part of (params.get("days") || "").split(",")) {
    const t = part.trim();
    if (!t) continue;
    const n = Number(t);
    if (!Number.isInteger(n) || n < 0 || n > 6 || seenDays.has(n)) continue;
    seenDays.add(n);
    days.push(n);
  }

  const from = (params.get("from") || "").trim();
  const to = (params.get("to") || "").trim();

  return {
    q: (params.get("q") || "").slice(0, 200),
    types: csvList(params.get("types")),
    status,
    from: isValidDateString(from) ? from : "",
    to: isValidDateString(to) ? to : "",
    priority,
    merchants: csvList(params.get("merchants")),
    neighborhoods: csvList(params.get("neighborhoods")),
    days,
  };
}

/**
 * Serialize filters back into a URLSearchParams instance, preserving any
 * unrelated params already present in `base` (e.g. `?section=deals`).
 * Default / empty values are omitted so URLs stay clean and shareable.
 */
export function writeFilters(base: URLSearchParams, filters: Filters): URLSearchParams {
  const params = new URLSearchParams(base);
  FILTER_KEYS.forEach((k) => params.delete(k));
  if (filters.q) params.set("q", filters.q);
  if (filters.types.length) params.set("types", filters.types.join(","));
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.priority.length) params.set("priority", filters.priority.join(","));
  if (filters.merchants.length) params.set("merchants", filters.merchants.join(","));
  if (filters.neighborhoods.length) params.set("neighborhoods", filters.neighborhoods.join(","));
  if (filters.days.length) params.set("days", filters.days.join(","));
  return params;
}

/** Derive a "priority" bucket from expiry urgency (no schema field exists). */
export function dealPriority(deal: Deal, now = new Date()): Priority | null {
  if (!deal.expires_at) return "low";
  const expires = new Date(deal.expires_at);
  if (Number.isNaN(expires.getTime())) return "low";
  const diffDays = (expires.getTime() - now.getTime()) / 86_400_000;
  if (diffDays < 0) return null; // expired
  if (diffDays <= 7) return "high";
  if (diffDays <= 30) return "medium";
  return "low";
}

export function matchesFilters(deal: Deal, f: Filters, now = new Date()): boolean {
  if (f.q) {
    const q = f.q.toLowerCase();
    const hay = `${deal.title} ${deal.venue_name} ${deal.description}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  if (f.types.length && !f.types.includes(deal.deal_type)) return false;
  const starts = deal.starts_at ? new Date(deal.starts_at) : null;
  const expires = deal.expires_at ? new Date(deal.expires_at) : null;
  if (f.status !== "all") {
    const isExpired = expires && expires < now;
    const isUpcoming = starts && starts > now;
    if (f.status === "active" && !deal.active) return false;
    if (f.status === "inactive" && deal.active) return false;
    if (f.status === "expired" && !isExpired) return false;
    if (f.status === "upcoming" && !isUpcoming) return false;
  }
  if (f.from && expires && expires < new Date(f.from)) return false;
  if (f.to && starts && starts > new Date(f.to + "T23:59:59")) return false;
  if (f.priority.length) {
    const p = dealPriority(deal, now);
    if (!p || !f.priority.includes(p)) return false;
  }
  if (f.merchants.length) {
    const key = deal.merchant_id ?? NONE_KEY;
    if (!f.merchants.includes(key)) return false;
  }
  if (f.neighborhoods.length) {
    const key = deal.neighborhood_id ?? NONE_KEY;
    if (!f.neighborhoods.includes(key)) return false;
  }
  if (f.days.length) {
    const days = deal.active_days ?? [];
    if (!f.days.some((d) => days.includes(d))) return false;
  }
  return true;
}