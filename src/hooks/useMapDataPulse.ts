import { useEffect, useId, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Subscribes to `map_data_pulse` — an aggregate heartbeat row (timestamp +
 * cumulative count, no user or coordinate data) bumped by a statement trigger
 * on `user_locations`.
 *
 * Precise locations are deliberately never broadcast over realtime, so map
 * layers listen to this privacy-safe signal instead and refetch through the
 * k-anonymised edge functions as soon as new activity lands.
 */
export function useMapDataPulse(onPulse: () => void, enabled = true) {
  const instanceId = useId();
  const handlerRef = useRef(onPulse);
  handlerRef.current = onPulse;

  useEffect(() => {
    if (!enabled) return;

    const channel = supabase
      .channel(`map-data-pulse-${instanceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "map_data_pulse" },
        () => {
          if (typeof document !== "undefined" && document.hidden) return;
          handlerRef.current?.();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, instanceId]);
}
