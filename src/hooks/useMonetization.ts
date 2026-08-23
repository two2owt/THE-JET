import { useCallback, useEffect, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  MONETIZATION_CONFIG_KEY,
  applyMonetizationValue,
  isMonetizationEnabled,
  isMonetizationHydrated,
  parseMonetizationValue,
  subscribeMonetization,
} from "@/lib/monetization";

/**
 * Read the global monetization flag reactively.
 *
 * Any component using this re-renders the moment an admin flips the switch,
 * because {@link useMonetizationConfigSync} pushes Realtime updates into the
 * same store.
 */
export function useMonetization(): { enabled: boolean; hydrated: boolean } {
  const enabled = useSyncExternalStore(
    subscribeMonetization,
    isMonetizationEnabled,
    () => false,
  );
  const hydrated = useSyncExternalStore(
    subscribeMonetization,
    isMonetizationHydrated,
    () => false,
  );
  return { enabled, hydrated };
}

/**
 * Mount ONCE at the app shell. Loads `app_config.monetization_enabled` and
 * keeps it live over Realtime so the paywall turns on/off for every device
 * without a reload or redeploy.
 */
export function useMonetizationConfigSync(): void {
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const { data, error } = await supabase
        .from("app_config")
        .select("value")
        .eq("key", MONETIZATION_CONFIG_KEY)
        .maybeSingle();
      if (cancelled || error) return;
      applyMonetizationValue(parseMonetizationValue(data?.value));
    };

    void load();

    const channel = supabase
      .channel(`app-config-${MONETIZATION_CONFIG_KEY}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "app_config",
          filter: `key=eq.${MONETIZATION_CONFIG_KEY}`,
        },
        (payload) => {
          const next = (payload.new ?? null) as { value?: unknown } | null;
          if (!next) return;
          applyMonetizationValue(parseMonetizationValue(next.value));
        },
      )
      .subscribe();

    // A device that was asleep/offline misses Realtime events — re-read on
    // resume so it can never sit on a stale paywall state.
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, []);
}

/**
 * Admin-only writer. Persists the flag globally; RLS rejects non-admins.
 */
export function useSetMonetization(): (enabled: boolean) => Promise<void> {
  return useCallback(async (next: boolean) => {
    const { error } = await supabase
      .from("app_config")
      .upsert(
        { key: MONETIZATION_CONFIG_KEY, value: next },
        { onConflict: "key" },
      );
    if (error) throw error;
    // Optimistic local apply; Realtime confirms for everyone else.
    applyMonetizationValue(next);
  }, []);
}
