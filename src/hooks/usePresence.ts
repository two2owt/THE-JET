import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Presence status buckets shown as the coloured dot on avatars.
 *   • "active"  — green:  user is connected and interacted in the last 5 min
 *   • "recent"  — yellow: user is connected but idle, or left very recently
 *   • "away"    — red:    not connected right now
 */
export type PresenceStatus = "active" | "recent" | "away";

/** Idle threshold: interaction older than this downgrades green → yellow. */
const IDLE_MS = 5 * 60 * 1000;
/** Grace window after a user disconnects before green/yellow → red. */
const RECENT_MS = 15 * 60 * 1000;
/** How often we re-broadcast our own heartbeat while the tab is active. */
const HEARTBEAT_MS = 60 * 1000;

const CHANNEL = "presence:jet";

type PresenceRow = { user_id: string; at: number };

interface PresenceState {
  /** last known activity timestamp per user id */
  seen: Record<string, number>;
  /** user ids currently joined to the channel */
  online: Set<string>;
}

let shared: {
  refCount: number;
  state: PresenceState;
  listeners: Set<(s: PresenceState) => void>;
  cleanup?: () => void;
} | null = null;

function emit() {
  if (!shared) return;
  const snapshot: PresenceState = {
    seen: { ...shared.state.seen },
    online: new Set(shared.state.online),
  };
  shared.state = snapshot;
  shared.listeners.forEach((l) => l(snapshot));
}

function subscribe(userId: string | undefined, listener: (s: PresenceState) => void) {
  if (!shared) {
    shared = {
      refCount: 0,
      state: { seen: {}, online: new Set() },
      listeners: new Set(),
    };

    const channel = supabase.channel(CHANNEL, {
      config: { presence: { key: userId ?? `anon-${Math.random()}` } },
    });

    let lastActivity = Date.now();
    const markActivity = () => {
      lastActivity = Date.now();
    };

    const syncState = () => {
      if (!shared) return;
      const raw = channel.presenceState<PresenceRow>();
      const online = new Set<string>();
      Object.values(raw).forEach((entries) => {
        entries.forEach((entry) => {
          if (!entry?.user_id) return;
          online.add(entry.user_id);
          const at = typeof entry.at === "number" ? entry.at : Date.now();
          const prev = shared!.state.seen[entry.user_id] ?? 0;
          if (at > prev) shared!.state.seen[entry.user_id] = at;
        });
      });
      // Anyone who just left keeps their last seen timestamp for the grace window.
      shared.state.online = online;
      emit();
    };

    channel
      .on("presence", { event: "sync" }, syncState)
      .on("presence", { event: "join" }, syncState)
      .on("presence", { event: "leave" }, syncState)
      .subscribe((status) => {
        if (status === "SUBSCRIBED" && userId) {
          void channel.track({ user_id: userId, at: Date.now() });
        }
      });

    const heartbeat = setInterval(() => {
      if (!userId) return;
      void channel.track({ user_id: userId, at: lastActivity });
      emit();
    }, HEARTBEAT_MS);

    const events = ["pointerdown", "keydown", "visibilitychange"] as const;
    events.forEach((e) =>
      window.addEventListener(e, markActivity, { passive: true }),
    );

    shared.cleanup = () => {
      clearInterval(heartbeat);
      events.forEach((e) => window.removeEventListener(e, markActivity));
      void supabase.removeChannel(channel);
    };
  }

  shared.refCount += 1;
  shared.listeners.add(listener);
  listener(shared.state);

  return () => {
    if (!shared) return;
    shared.listeners.delete(listener);
    shared.refCount -= 1;
    if (shared.refCount <= 0) {
      shared.cleanup?.();
      shared = null;
    }
  };
}

function statusFor(state: PresenceState, userId: string | null | undefined, now: number): PresenceStatus {
  if (!userId) return "away";
  const seen = state.seen[userId];
  if (state.online.has(userId)) {
    if (!seen || now - seen <= IDLE_MS) return "active";
    return "recent";
  }
  if (seen && now - seen <= RECENT_MS) return "recent";
  return "away";
}

/**
 * Live presence for the signed-in user plus anyone else on the shared channel.
 * Uses Supabase Realtime presence only — no schema or write path involved.
 */
export function usePresence(currentUserId?: string) {
  const [state, setState] = useState<PresenceState>({
    seen: {},
    online: new Set(),
  });
  const [tick, setTick] = useState(0);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (typeof window === "undefined") return;
    return subscribe(currentUserId, setState);
  }, [currentUserId]);

  // Re-evaluate buckets on a timer so green decays to yellow/red on its own.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30 * 1000);
    return () => clearInterval(id);
  }, []);

  return useMemo(() => {
    const now = Date.now();
    return {
      /** Status of an arbitrary user id (friends on the social page). */
      getStatus: (userId: string | null | undefined): PresenceStatus =>
        statusFor(state, userId, now),
      /** Status of the signed-in user (header avatar). */
      selfStatus: statusFor(state, currentUserId, now),
      onlineCount: state.online.size,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, currentUserId, tick]);
}
