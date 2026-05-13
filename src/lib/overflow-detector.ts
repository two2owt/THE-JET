/**
 * DEV-only horizontal-overflow detector.
 *
 * Production CSS already clips horizontal overflow on <html>/<body>
 * (see src/index.css). That hides bugs but doesn't prevent them — a
 * leaking element can still cause clipped UI, broken layouts on
 * specific breakpoints, or unexpected scroll on inner containers.
 *
 * This detector runs in development only. It:
 *   1. Scans the DOM for elements whose layout box extends past the
 *      viewport's right edge by more than a small tolerance.
 *   2. Logs an actionable warning in the console with the element,
 *      its classes, and how many pixels it overflowed.
 *   3. Re-scans on resize and on DOM mutations (debounced).
 *
 * Enable with VITE_DETECT_OVERFLOW=1 or automatically in dev mode.
 * Set window.__disableOverflowDetector = true to silence at runtime.
 */

const TOLERANCE_PX = 1;
const DEBOUNCE_MS = 250;

type LeakReport = {
  element: Element;
  overflowPx: number;
  rect: DOMRect;
};

function isExcluded(el: Element): boolean {
  // Skip elements explicitly marked as intentionally off-screen, our own
 // harness sidebar, and elements inside elements with overflow:hidden
  // (their parent already clips them, so they aren't user-visible leaks).
  if (el.hasAttribute("data-allow-overflow")) return true;
  if (el.getAttribute("aria-hidden") === "true") {
    const cs = getComputedStyle(el);
    if (cs.position === "absolute" || cs.position === "fixed") return true;
  }
  return false;
}

function hasClippingAncestor(el: Element): boolean {
  let node: Element | null = el.parentElement;
  while (node && node !== document.documentElement) {
    const cs = getComputedStyle(node);
    if (
      cs.overflowX === "hidden" ||
      cs.overflowX === "clip" ||
      cs.overflowX === "scroll" ||
      cs.overflowX === "auto"
    ) {
      return true;
    }
    node = node.parentElement;
  }
  return false;
}

export function scanForHorizontalOverflow(): LeakReport[] {
  const viewportRight = window.innerWidth;
  const leaks: LeakReport[] = [];

  const all = document.querySelectorAll<HTMLElement>("body *");
  for (const el of all) {
    if (isExcluded(el)) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    const overflow = rect.right - viewportRight;
    if (overflow > TOLERANCE_PX && !hasClippingAncestor(el)) {
      leaks.push({ element: el, overflowPx: overflow, rect });
    }
  }
  return leaks;
}

let scheduled = 0;
function scheduleScan() {
  if (typeof window === "undefined") return;
  if ((window as unknown as { __disableOverflowDetector?: boolean }).__disableOverflowDetector) return;
  if (scheduled) window.clearTimeout(scheduled);
  scheduled = window.setTimeout(() => {
    scheduled = 0;
    const leaks = scanForHorizontalOverflow();
    if (!leaks.length) return;
    // eslint-disable-next-line no-console
    console.groupCollapsed(
      `%c[overflow-detector] ${leaks.length} element(s) overflow viewport horizontally`,
      "color:#ff6b6b;font-weight:bold;",
    );
    for (const { element, overflowPx } of leaks.slice(0, 20)) {
      // eslint-disable-next-line no-console
      console.warn(
        `+${overflowPx.toFixed(1)}px →`,
        element,
        (element as HTMLElement).className || "",
      );
    }
    if (leaks.length > 20) {
      // eslint-disable-next-line no-console
      console.warn(`…and ${leaks.length - 20} more`);
    }
    // eslint-disable-next-line no-console
    console.groupEnd();
  }, DEBOUNCE_MS);
}

let started = false;
export function startOverflowDetector(): () => void {
  if (started || typeof window === "undefined") return () => {};
  started = true;

  const mo = new MutationObserver(scheduleScan);
  mo.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "style"],
  });
  window.addEventListener("resize", scheduleScan);
  // Initial scan after first paint.
  scheduleScan();

  return () => {
    mo.disconnect();
    window.removeEventListener("resize", scheduleScan);
    started = false;
  };
}