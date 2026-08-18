import { useEffect, useState } from "react";

/**
 * Global single-slot queue for app-level onboarding dialogs (location, push,
 * PWA install). Only one may be open at a time — stacked Radix dialogs leave
 * `pointer-events: none` on <body> when one unmounts, which silently freezes
 * the whole UI (bottom nav included).
 *
 * Higher priority wins the slot; lower-priority waiters open once it frees.
 */
type Waiter = {
  id: string;
  priority: number;
  notify: (active: boolean) => void;
};

const waiters: Waiter[] = [];
let holder: string | null = null;

const settle = () => {
  if (holder && waiters.some((w) => w.id === holder)) return;
  holder = null;
  const next = [...waiters].sort((a, b) => b.priority - a.priority)[0];
  if (next) {
    holder = next.id;
    next.notify(true);
  }
};

export const usePromptSlot = (
  id: string,
  priority: number,
  wanted: boolean,
) => {
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!wanted) return;
    const waiter: Waiter = { id, priority, notify: setActive };
    waiters.push(waiter);
    settle();
    return () => {
      const i = waiters.indexOf(waiter);
      if (i >= 0) waiters.splice(i, 1);
      setActive(false);
      if (holder === id) {
        holder = null;
        settle();
      }
    };
  }, [id, priority, wanted]);

  return wanted && active;
};

export const PROMPT_PRIORITY = {
  location: 30,
  push: 20,
  pwa: 10,
} as const;
