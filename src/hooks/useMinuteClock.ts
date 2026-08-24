/**
 * Shared minute clock.
 *
 * Countdown UI ("expires in 4m") only needs a new value when the wall clock
 * rolls over to the next minute. Every consumer subscribing to its own
 * `setInterval` means N timers drifting against each other, so the same label
 * can read "4m" in one card and "3m" in another.
 *
 * This module keeps ONE timer for the whole app:
 *  - it aligns to the next real minute boundary instead of firing 60s after
 *    mount, so labels flip exactly when the minute changes;
 *  - it stops entirely while the tab is hidden and re-syncs on visibility, so
 *    a backgrounded tab burns no timers and shows fresh values on return;
 *  - it is purely client-side — no network, no backend polling.
 */
import { useEffect, useState } from "react";

type Listener = (now: number) => void;

const listeners = new Set<Listener>();
let timer: ReturnType<typeof setTimeout> | null = null;
let current = Date.now();

const msToNextMinute = (from: number) => 60_000 - (from % 60_000);

const stop = () => {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
};

const tick = () => {
  current = Date.now();
  for (const listener of listeners) listener(current);
  schedule();
};

function schedule() {
  stop();
  if (listeners.size === 0) return;
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
  // +50ms guard so we land just after the boundary, never just before it.
  timer = setTimeout(tick, msToNextMinute(Date.now()) + 50);
}

const handleVisibility = () => {
  if (typeof document === "undefined") return;
  if (document.visibilityState === "hidden") {
    stop();
    return;
  }
  tick(); // catch up immediately, then resume aligned ticking
};

const subscribe = (listener: Listener) => {
  const first = listeners.size === 0;
  listeners.add(listener);
  if (first && typeof document !== "undefined") {
    document.addEventListener("visibilitychange", handleVisibility);
  }
  schedule();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      stop();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibility);
      }
    }
  };
};

/**
 * Returns a timestamp that updates on each minute boundary.
 * Pass `enabled: false` (e.g. nothing on screen has an expiry) to opt out.
 */
export const useMinuteClock = (enabled = true): number => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    return subscribe(setNow);
  }, [enabled]);

  return now;
};

export const __testing = { msToNextMinute };
