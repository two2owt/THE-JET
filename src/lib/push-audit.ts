import { supabase } from "@/integrations/supabase/client";

export type PushAuditAction =
  | "preference_enabled"
  | "preference_disabled"
  | "device_enabled"
  | "device_disabled"
  | "permission_revoked";

export interface PushAuditEntry {
  id: string;
  action: PushAuditAction;
  source: string;
  platform: string | null;
  endpoint_tail: string | null;
  detail: Record<string, unknown> | null;
  created_at: string;
}

const DEDUPE_KEY = "jet:push-audit-last";

function endpointTail(endpoint?: string | null): string | null {
  if (!endpoint) return null;
  return endpoint.slice(-12);
}

/**
 * Appends a row to the user's private push audit trail.
 *
 * `dedupeKey` suppresses repeat writes for unchanged device state so the
 * launch/foreground reconciliation doesn't flood the log — the toggle in
 * Settings always writes (it represents a deliberate user action).
 */
export async function logPushAudit(
  userId: string,
  action: PushAuditAction,
  source: string,
  options: {
    platform?: string;
    endpoint?: string | null;
    detail?: Record<string, unknown>;
    dedupe?: boolean;
  } = {},
): Promise<void> {
  const { platform = "web", endpoint, detail, dedupe = false } = options;

  if (dedupe && typeof window !== "undefined") {
    const signature = `${userId}|${action}|${endpointTail(endpoint) ?? ""}`;
    try {
      if (localStorage.getItem(DEDUPE_KEY) === signature) return;
      localStorage.setItem(DEDUPE_KEY, signature);
    } catch {
      /* storage unavailable: fall through and log */
    }
  }

  const { error } = await supabase.from("push_notification_audit").insert({
    user_id: userId,
    action,
    source,
    platform,
    endpoint_tail: endpointTail(endpoint),
    detail: detail ?? null,
  });
  if (error) console.warn("[push] audit write failed", error);
}

export async function fetchPushAudit(
  userId: string,
  limit = 25,
): Promise<PushAuditEntry[]> {
  const { data, error } = await supabase
    .from("push_notification_audit")
    .select("id, action, source, platform, endpoint_tail, detail, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.warn("[push] audit read failed", error);
    return [];
  }
  return (data ?? []) as PushAuditEntry[];
}

export const PUSH_AUDIT_LABELS: Record<PushAuditAction, string> = {
  preference_enabled: "Turned notifications on",
  preference_disabled: "Turned notifications off",
  device_enabled: "Device subscription enabled",
  device_disabled: "Device subscription disabled",
  permission_revoked: "Browser permission revoked",
};
