import { useCallback, useEffect, useRef, useState } from "react";

type Options = {
  /** Lower bound for the scale factor (0–1). */
  minScale?: number;
  /** CSS selector for the height-constraining ancestor (defaults to the parent). */
  containerSelector?: string;
};

/**
 * Scales an element down just enough to fit the available height of its
 * container, so a page never needs to scroll on short viewports (landscape
 * phones, small desktop windows, browser chrome variations).
 *
 * Layout-safe: a compensating negative margin keeps the scaled element's
 * flow height equal to its visual height.
 */
export function useAutoFitScale<T extends HTMLElement>({
  minScale = 0.7,
  containerSelector,
}: Options = {}) {
  const [node, setNode] = useState<T | null>(null);
  const raf = useRef<number | null>(null);

  const measure = useCallback(() => {
    const el = node;
    if (!el) return;
    const container = containerSelector
      ? ((el.closest(containerSelector) as HTMLElement | null) ??
        el.parentElement)
      : el.parentElement;
    if (!container) return;

    // Reset before measuring the natural (unscaled) height.
    el.style.transform = "";
    el.style.marginBottom = "";

    const cs = getComputedStyle(container);
    let available =
      container.clientHeight -
      parseFloat(cs.paddingTop || "0") -
      parseFloat(cs.paddingBottom || "0");
    const inner = el.parentElement;
    if (inner && inner !== container) {
      const ics = getComputedStyle(inner);
      available -=
        parseFloat(ics.paddingTop || "0") +
        parseFloat(ics.paddingBottom || "0");
    }

    // scrollHeight rounds down and ignores collapsed/overflowing child margins,
    // so prefer the rendered box height and fold in any residual container
    // overflow measured while unscaled.
    const scroller = inner && inner !== container ? inner : container;
    const residual = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    const natural =
      Math.max(el.scrollHeight, Math.ceil(el.getBoundingClientRect().height)) +
      residual;
    if (available <= 0 || natural <= 0) return;

    const apply = (scale: number) => {
      el.style.transformOrigin = "top center";
      el.style.transform = `scale(${scale})`;
      el.style.marginBottom = `${-natural * (1 - scale)}px`;
    };

    let scale = Math.min(1, Math.max(minScale, (available - 1) / natural));
    if (scale >= 1) return;
    apply(scale);

    // Correction pass: sub-pixel rounding or late-loading content can still
    // leave a few pixels of overflow. Shrink once more if the container scrolls.
    for (let i = 0; i < 3; i++) {
      const overflow = scroller.scrollHeight - scroller.clientHeight;
      if (overflow <= 0 || scale <= minScale) break;
      const next = Math.max(minScale, scale * (1 - (overflow + 1) / natural));
      if (next >= scale) break;
      scale = next;
      apply(scale);
    }
  }, [node, containerSelector, minScale]);

  const schedule = useCallback(() => {
    if (raf.current != null) cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(measure);
  }, [measure]);

  useEffect(() => {
    if (!node) return;
    schedule();
    const ro = new ResizeObserver(schedule);
    ro.observe(node);
    const container = containerSelector
      ? (node.closest(containerSelector) as HTMLElement | null)
      : node.parentElement;
    if (container) ro.observe(container);
    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      if (raf.current != null) cancelAnimationFrame(raf.current);
    };
  }, [node, schedule, containerSelector]);

  return setNode as (el: T | null) => void;
}
