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
  /** Coalescing window in ms for bursts of edits on the same profile. */
  debounceMs = 400,
) {
  const instanceId = useId();
  const handlerRef = useRef(onPulse);
  handlerRef.current = onPulse;

  useEffect(() => {
    if (!enabled) return;

    // Pulses are always buffered (deduped by profile, latest wins) and
    // flushed on a trailing debounce. This collapses rapid successive
    // profile edits — and pulses that land while the tab is hidden — into
    // a single refetch/re-render per profile.
    const pending = new Map<string, ProfilePulse>();
    let timer: ReturnType<typeof setTimeout> | null = null;

    const clearTimer = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const flush = () => {
      clearTimer();
      if (!pending.size) return;
      if (typeof document !== "undefined" && document.hidden) return;
      const queued = [...pending.values()];
      pending.clear();
      queued.forEach((p) => handlerRef.current?.(p));
    };

    const schedule = () => {
      clearTimer();
      timer = setTimeout(flush, Math.max(0, debounceMs));
    };

    const onVisibility = () => {
      if (typeof document !== "undefined" && !document.hidden) flush();
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }

    const channel = supabase
      .channel(`profile-pulse-${instanceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profile_pulse" },
        (payload) => {
          const row = payload.new as Partial<ProfilePulse> | null;
          if (!row?.profile_id) return;
          const pulse: ProfilePulse = {
            profile_id: row.profile_id,
            event: row.event === "created" ? "created" : "updated",
            updated_at: row.updated_at ?? new Date().toISOString(),
          };
          pending.set(pulse.profile_id, pulse);
          if (typeof document !== "undefined" && document.hidden) return;
          schedule();
        },
      )
      .subscribe();

    return () => {
      clearTimer();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
      pending.clear();
      void supabase.removeChannel(channel);
    };
  }, [enabled, instanceId, debounceMs]);
}


