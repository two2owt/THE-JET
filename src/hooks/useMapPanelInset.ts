import { useEffect } from "react";

/**
 * Publishes the real, measured height of an open map panel (JetCard / ParkingCard)
 * as `--map-panel-bottom` so every map overlay (legend, layers FAB, Mapbox controls,
 * camera padding) lifts by exactly the space the panel occupies — no guessed
 * reserve, no overlap, no dead space.
 */
export function useMapPanelInset(
  ref: React.RefObject<HTMLElement | null>,
  active: boolean,
  gap = 8,
) {
  useEffect(() => {
    const root = document.documentElement;
    const publish = (value: string) => {
      root.style.setProperty("--map-panel-bottom", value);
      window.dispatchEvent(new CustomEvent("jet:panel-metrics"));
    };

    if (!active || !ref.current) {
      publish("0px");
      return;
    }

    const el = ref.current;
    let last = -1;
    const measure = () => {
      const h = Math.round(el.getBoundingClientRect().height);
      if (h === last) return;
      last = h;
      publish(`${Math.max(0, h + gap)}px`);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);

    return () => {
      observer.disconnect();
      publish("0px");
    };
  }, [ref, active, gap]);
}
