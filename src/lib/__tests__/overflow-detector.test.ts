import { describe, it, expect, beforeEach } from "vitest";
import { scanForHorizontalOverflow } from "@/lib/overflow-detector";

function setViewport(width: number) {
  Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
}

describe("scanForHorizontalOverflow", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    setViewport(800);
  });

  it("returns no leaks for in-bounds elements", () => {
    const el = document.createElement("div");
    Object.defineProperty(el, "getBoundingClientRect", {
      value: () => ({ left: 0, right: 700, top: 0, bottom: 50, width: 700, height: 50, x: 0, y: 0, toJSON: () => ({}) }),
    });
    document.body.appendChild(el);
    expect(scanForHorizontalOverflow()).toHaveLength(0);
  });

  it("flags elements that exceed the viewport's right edge", () => {
    const el = document.createElement("div");
    Object.defineProperty(el, "getBoundingClientRect", {
      value: () => ({ left: 0, right: 950, top: 0, bottom: 50, width: 950, height: 50, x: 0, y: 0, toJSON: () => ({}) }),
    });
    document.body.appendChild(el);
    const leaks = scanForHorizontalOverflow();
    expect(leaks).toHaveLength(1);
    expect(leaks[0].overflowPx).toBeCloseTo(150, 0);
  });

  it("ignores elements opted out via data-allow-overflow", () => {
    const el = document.createElement("div");
    el.setAttribute("data-allow-overflow", "");
    Object.defineProperty(el, "getBoundingClientRect", {
      value: () => ({ left: 0, right: 9999, top: 0, bottom: 50, width: 9999, height: 50, x: 0, y: 0, toJSON: () => ({}) }),
    });
    document.body.appendChild(el);
    expect(scanForHorizontalOverflow()).toHaveLength(0);
  });

  it("ignores elements clipped by an overflow:hidden ancestor", () => {
    const wrap = document.createElement("div");
    wrap.style.overflowX = "hidden";
    const child = document.createElement("div");
    Object.defineProperty(child, "getBoundingClientRect", {
      value: () => ({ left: 0, right: 9999, top: 0, bottom: 50, width: 9999, height: 50, x: 0, y: 0, toJSON: () => ({}) }),
    });
    wrap.appendChild(child);
    document.body.appendChild(wrap);
    expect(scanForHorizontalOverflow()).toHaveLength(0);
  });
});