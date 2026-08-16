declare module "@fontsource-variable/plus-jakarta-sans";

// Visual Viewport API types for mobile viewport handling
interface VisualViewport extends EventTarget {
  readonly offsetLeft: number;
  readonly offsetTop: number;
  readonly pageLeft: number;
  readonly pageTop: number;
  readonly width: number;
  readonly height: number;
  readonly scale: number;
  onresize: ((this: VisualViewport, ev: Event) => void) | null;
  onscroll: ((this: VisualViewport, ev: Event) => void) | null;
}

interface Window {
  visualViewport?: VisualViewport;
  __PREFETCHED_DATA__?: {
    deals?: unknown[];
    neighborhoods?: unknown[];
  };
}