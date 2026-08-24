import { useEffect, useId, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Wildcard profile id used by "resync" pulses emitted after the realtime
 * connection drops and recovers — consumers that filter by a specific
 * profile should treat it as "refetch everything you render".
 */
export const PROFILE_PULSE_ALL = "*";

export interface ProfilePulse {
  profile_id: string;
  /**
   * "created" for a brand-new sign-up, "updated" for a profile edit,
   * "resync" when the realtime channel reconnected and pulses may have
   * been missed while it was down.
   */
  event: "created" | "updated" | "resync";
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
 *
 * If the socket drops (sleep, network change, server restart) the hook
 * resubscribes with exponential backoff and emits a `resync` pulse once the
 * channel is healthy again so consumers refetch whatever they missed.
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
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let attempt = 0;
    let hadDrop = false;
    let disposed = false;

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

    const enqueue = (pulse: ProfilePulse) => {
      pending.set(pulse.profile_id, pulse);
      if (typeof document !== "undefined" && document.hidden) return;
      schedule();
    };

    const teardown = () => {
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      if (channel) {
        const c = channel;
        channel = null;
        void supabase.removeChannel(c);
      }
    };

    const scheduleReconnect = () => {
      if (disposed || retryTimer) return;
      hadDrop = true;
      const delay = Math.min(30_000, 1_000 * 2 ** attempt);
      attempt += 1;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        teardown();
        connect();
      }, delay);
    };

    function connect() {
      if (disposed) return;
      channel = supabase
        .channel(`profile-pulse-${instanceId}-${attempt}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "profile_pulse" },
          (payload) => {
            const row = payload.new as Partial<ProfilePulse> | null;
            if (!row?.profile_id) return;
            enqueue({
              profile_id: row.profile_id,
              event: row.event === "created" ? "created" : "updated",
              updated_at: row.updated_at ?? new Date().toISOString(),
            });
          },
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            attempt = 0;
            if (hadDrop) {
              hadDrop = false;
              // Pulses emitted while the socket was down are lost; ask every
              // consumer to refetch the profile data it renders.
              enqueue({
                profile_id: PROFILE_PULSE_ALL,
                event: "resync",
                updated_at: new Date().toISOString(),
              });
            }
            return;
          }
          if (
            status === "CHANNEL_ERROR" ||
            status === "TIMED_OUT" ||
            status === "CLOSED"
          ) {
            scheduleReconnect();
          }
        });
    }

    const onVisibility = () => {
      if (typeof document === "undefined" || document.hidden) return;
      flush();
      // Waking from a backgrounded tab often means the socket died silently.
      if (channel && channel.state !== "joined") scheduleReconnect();
    };
    const onOnline = () => scheduleReconnect();

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }
    if (typeof window !== "undefined") {
      window.addEventListener("online", onOnline);
    }

    connect();

    return () => {
      disposed = true;
      clearTimer();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("online", onOnline);
      }
      pending.clear();
      teardown();
    };
  }, [enabled, instanceId, debounceMs]);
}
