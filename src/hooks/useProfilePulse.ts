import { useEffect, useId, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ProfilePulse {
  profile_id: string;
  /** "created" for a brand-new sign-up, "updated" for a profile edit. */
  event: "created" | "updated";
  updated_at: string;
}

/**
 * Subscribes to `public.profile_pulse` — a privacy-safe heartbeat row
 * (profile id + created/updated flag + timestamp) bumped by a trigger on
 * `public.profiles`.
 *
 * Profile rows themselves are never broadcast over realtime (they hold
 * birthdate, consent and privacy fields), so every surface that renders
 * other people's profiles listens to this signal and refetches through
 * the RLS-scoped `discoverable_profiles` view instead. That makes profile
 * edits and new sign-ups appear instantly on all users' pages.
 */
export function useProfilePulse(
  onPulse: (pulse: ProfilePulse) => void,
  enabled = true,
) {
  const instanceId = useId();
  const handlerRef = useRef(onPulse);
  handlerRef.current = onPulse;

  useEffect(() => {
    if (!enabled) return;

    const channel = supabase
      .channel(`profile-pulse-${instanceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profile_pulse" },
        (payload) => {
          if (typeof document !== "undefined" && document.hidden) return;
          const row = payload.new as Partial<ProfilePulse> | null;
          if (!row?.profile_id) return;
          handlerRef.current?.({
            profile_id: row.profile_id,
            event: row.event === "created" ? "created" : "updated",
            updated_at: row.updated_at ?? new Date().toISOString(),
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, instanceId]);
}
