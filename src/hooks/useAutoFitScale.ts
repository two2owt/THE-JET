import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

/**
 * Scales an element down just enough to fit its parent's available height,
 * so a page never needs to scroll on short viewports (landscape phones,
 * small browser windows, on-screen-keyboard-free layouts).
 *
 * Layout-safe: the negative margin compensates for the transform so the
 * scaled element still occupies its visual height in flow.
 */
export function useAutoFitScale<T extends HTMLElement>(
  { minScale = 0.7, deps = [] as unknown[] } = {},
) {
  const ref = useRef<T | null>(null);
  const raf = useRef<number | null>(null);

  const measure = useCallback(() => {
    const el = ref.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;

    // Reset before measuring the natural height.
    el.style.transform = "";
    el.style.marginBottom = "";

    const cs = getComputedStyle(parent);
    const available =
      parent.clientHeight -
      parseFloat(cs.paddingTop || "0") -
      parseFloat(cs.paddingBottom || "0");
    const natural = el.scrollHeight;
    if (!available || !natural) return;

    const scale = Math.min(1, Math.max(minScale, available / natural));
    if (scale >= 0.999) return;

    el.style.transformOrigin = "top center";
    el.style.transform = `scale(${scale})`;
    el.style.marginBottom = `${-natural * (1 - scale)}px`;
  }, [minScale]);

  const schedule = useCallback(() => {
    if (raf.current != null) cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(measure);
  }, [measure]);

  useLayoutEffect(() => {
    schedule();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule, ...deps]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(schedule);
    ro.observe(el);
    if (el.parentElement) ro.observe(el.parentElement);
    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      if (raf.current != null) cancelAnimationFrame(raf.current);
    };
  }, [schedule]);

  return ref;
}
