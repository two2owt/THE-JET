/**
 * Global lock used by overlay panels (JetCard, search results) to temporarily
 * suspend Mapbox drag / scroll-zoom while the user interacts with them.
 * Ref-counted so multiple panels can hold the lock at the same time.
 */
import { useEffect, useRef, useState } from "react";

let lockCount = 0;
const listeners = new Set<(locked: boolean) => void>();

const emit = () => {
  const locked = lockCount > 0;
  listeners.forEach((l) => l(locked));
};

export const acquireMapInteractionLock = () => {
  lockCount += 1;
  if (lockCount === 1) emit();
};

export const releaseMapInteractionLock = () => {
  if (lockCount === 0) return;
  lockCount -= 1;
  if (lockCount === 0) emit();
};

export const isMapInteractionLocked = () => lockCount > 0;

export const subscribeMapInteractionLock = (cb: (locked: boolean) => void) => {
  listeners.add(cb);
  cb(lockCount > 0);
  return () => {
    listeners.delete(cb);
  };
};

/** Subscribe React state to the lock. */
export function useMapInteractionLocked() {
  const [locked, setLocked] = useState(isMapInteractionLocked);
  useEffect(() => subscribeMapInteractionLock(setLocked), []);
  return locked;
}

/**
 * Hold the lock while the pointer/focus is inside `ref`'s element (and always
 * while a touch is active on it). Returns nothing — attach the ref to the panel.
 */
export function useLockMapWhileInteracting(
  target: React.RefObject<HTMLElement | null> | HTMLElement | null,
  enabled = true,
) {
  const heldRef = useRef(false);
  const el = target && "current" in target ? target.current : target;

  useEffect(() => {
    const hold = () => {
      if (heldRef.current) return;
      heldRef.current = true;
      acquireMapInteractionLock();
    };
    const release = () => {
      if (!heldRef.current) return;
      heldRef.current = false;
      releaseMapInteractionLock();
    };

    if (!enabled || !el) {
      release();
      return;
    }

    el.addEventListener("pointerenter", hold);
    el.addEventListener("pointerdown", hold);
    el.addEventListener("touchstart", hold, { passive: true });
    el.addEventListener("focusin", hold);
    el.addEventListener("pointerleave", release);
    el.addEventListener("pointercancel", release);
    el.addEventListener("touchend", release);
    el.addEventListener("touchcancel", release);
    el.addEventListener("focusout", release);

    return () => {
      el.removeEventListener("pointerenter", hold);
      el.removeEventListener("pointerdown", hold);
      el.removeEventListener("touchstart", hold);
      el.removeEventListener("focusin", hold);
      el.removeEventListener("pointerleave", release);
      el.removeEventListener("pointercancel", release);
      el.removeEventListener("touchend", release);
      el.removeEventListener("touchcancel", release);
      el.removeEventListener("focusout", release);
      release();
    };
  }, [el, enabled]);
}
