import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface LocationPreferences {
  locationTrackingEnabled: boolean;
  backgroundTrackingEnabled: boolean;
  isLoading: boolean;
}

/**
 * Reads the signed-in user's location tracking preferences from
 * `public.user_preferences` and keeps them live via realtime, so toggling a
 * setting anywhere (or on another device) immediately starts/stops tracking.
 *
 * Defaults are conservative: tracking is treated as OFF until the row loads.
 */
export function useLocationPreferences(): LocationPreferences {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const [prefs, setPrefs] = useState({ location: false, background: false });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    if (!userId) {
      setPrefs({ location: false, background: false });
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    const load = async () => {
      const { data } = await supabase
        .from("user_preferences")
        .select("location_tracking_enabled, background_tracking_enabled")
        .eq("user_id", userId)
        .maybeSingle();
      if (cancelled) return;
      setPrefs({
        location: Boolean(data?.location_tracking_enabled),
        background: Boolean(data?.background_tracking_enabled),
      });
      setIsLoading(false);
    };

    void load();

    const channel = supabase
      .channel(`user-preferences-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_preferences",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as
            | { location_tracking_enabled?: boolean; background_tracking_enabled?: boolean }
            | null;
          if (!row) return;
          setPrefs({
            location: Boolean(row.location_tracking_enabled),
            background: Boolean(row.background_tracking_enabled),
          });
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  return {
    locationTrackingEnabled: prefs.location,
    backgroundTrackingEnabled: prefs.background,
    isLoading,
  };
}

export default useLocationPreferences;