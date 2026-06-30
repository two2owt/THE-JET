import * as React from "react";

/**
 * Tailwind-aligned breakpoint hook.
 *
 * Returns the current named breakpoint based on `window.innerWidth`, matching
 * Tailwind v3 defaults so JS-driven layout decisions stay in lockstep with
 * CSS utility classes:
 *
 *   xs:  < 640px    (phones)
 *   sm:  640–767px  (large phones / small foldables)
 *   md:  768–1023px (tablets portrait)
 *   lg:  1024–1279px(tablets landscape / small laptops)
 *   xl:  ≥ 1280px   (desktops)
 *
 * Use this anywhere finer-grained logic is needed than a binary
 * mobile/desktop check (foldables, iPad mini portrait edge case, landscape
 * phones).
 */
export type Breakpoint = "xs" | "sm" | "md" | "lg" | "xl";

const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
} as const;

function resolveBreakpoint(width: number): Breakpoint {
  if (width >= BREAKPOINTS.xl) return "xl";
  if (width >= BREAKPOINTS.lg) return "lg";
  if (width >= BREAKPOINTS.md) return "md";
  if (width >= BREAKPOINTS.sm) return "sm";
  return "xs";
}

export function useBreakpoint(): Breakpoint {
  const [bp, setBp] = React.useState<Breakpoint>(() => {
    if (typeof window === "undefined") return "xs";
    return resolveBreakpoint(window.innerWidth);
  });

  React.useEffect(() => {
    const onResize = () => setBp(resolveBreakpoint(window.innerWidth));
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return bp;
}

/** Convenience: true when current breakpoint is at least the given size. */
export function useBreakpointUp(min: Exclude<Breakpoint, "xs">): boolean {
  const bp = useBreakpoint();
  const order: Breakpoint[] = ["xs", "sm", "md", "lg", "xl"];
  return order.indexOf(bp) >= order.indexOf(min);
}