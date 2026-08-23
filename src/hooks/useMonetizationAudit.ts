import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  MONETIZATION_CONFIG_KEY,
  parseMonetizationValue,
} from "@/lib/monetization";

export type MonetizationAuditEntry = {
  id: string;
  changedAt: string;
  changedBy: string | null;
  changedByName: string | null;
  from: boolean | null;
  to: boolean;
};

/**
 * Admin-only change history for the global monetization flag.
 *
 * Rows are written by a database trigger on `app_config`, so the log records
 * every change regardless of which client (or SQL session) made it. RLS limits
 * SELECT to admins; non-admins simply get an empty list.
 */
export function useMonetizationAudit(enabled: boolean, limit = 8) {
  const [entries, setEntries] = useState<MonetizationAuditEntry[]>([]);
  const [loading, setLoading] = useState(enabled);

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("app_config_audit")
      .select("id, changed_at, changed_by, old_value, new_value")
      .eq("key", MONETIZATION_CONFIG_KEY)
      .order("changed_at", { ascending: false })
      .limit(limit);

    if (error || !data) {
      setEntries([]);
      setLoading(false);
      return;
    }

    const actorIds = Array.from(
      new Set(data.map((row) => row.changed_by).filter((id): id is string => !!id)),
    );

    let names = new Map<string, string>();
    if (actorIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", actorIds);
      names = new Map(
        (profiles ?? [])
          .filter((p) => !!p.display_name)
          .map((p) => [p.id, p.display_name as string]),
      );
    }

    setEntries(
      data.map((row) => ({
        id: row.id,
        changedAt: row.changed_at,
        changedBy: row.changed_by,
        changedByName: row.changed_by ? (names.get(row.changed_by) ?? null) : null,
        from: row.old_value === null ? null : parseMonetizationValue(row.old_value),
        to: parseMonetizationValue(row.new_value),
      })),
    );
    setLoading(false);
  }, [enabled, limit]);

  useEffect(() => {
    if (!enabled) {
      setEntries([]);
      setLoading(false);
      return;
    }
    void load();
  }, [enabled, load]);

  return useMemo(
    () => ({ entries, loading, refresh: load }),
    [entries, loading, load],
  );
}
