import { useBreakpoint } from "./useBreakpoint";

/**
 * Backwards-compatible binary mobile check. New code should prefer
 * `useBreakpoint()` for finer-grained responsive logic (foldables,
 * iPad mini portrait, landscape phones).
 */
export function useIsMobile() {
  const bp = useBreakpoint();
  return bp === "xs" || bp === "sm";
}