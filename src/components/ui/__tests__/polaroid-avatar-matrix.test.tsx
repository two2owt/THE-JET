import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { PolaroidAvatar } from "@/components/ui/polaroid-avatar";

/**
 * Cross-device matrix for PolaroidAvatar.
 *
 * jsdom has no layout engine, so painted pixels are verified live in the
 * browser. Here we lock the contracts that guarantee uploaded photos stay
 * inside their frame regardless of:
 *   • size       — every PolaroidAvatar size variant
 *   • aspect     — extreme portrait / landscape / square uploads
 *   • breakpoint — mobile / tablet / desktop (CSS clamp() expression)
 *
 * Contracts under test:
 *   1. Wrapper width is the size's responsive `clamp(min, vw, max)` and
 *      `font-size` matches it (em anchoring → all internal padding,
 *      caption and bottom-strip scale together).
 *   2. Wrapper carries `max-w-full`, `inline-block`, `flex-shrink-0`
 *      and `overflow:hidden` photo area — the three things that prevent
 *      a Polaroid from leaking past its parent in any layout.
 *   3. Photo area is `aspect-square` + `aspectRatio: 1/1` and absolutely
 *      positions the `<img>` with `object-cover` — locks 1:1 box and
 *      crops uploaded images regardless of intrinsic dimensions.
 */

const SIZES = ["xs", "sm", "md", "lg", "xl"] as const;

/** Expected `clamp(min, vw, max)` per size — must match polaroid-avatar.tsx. */
const SIZE_CLAMP: Record<(typeof SIZES)[number], { min: number; max: number }> = {
  xs: { min: 44, max: 56 },
  sm: { min: 64, max: 84 },
  md: { min: 88, max: 112 },
  lg: { min: 112, max: 160 },
  xl: { min: 144, max: 220 },
};

const ASPECTS = [
  { key: "portrait-extreme", w: 200, h: 4000 },
  { key: "landscape-extreme", w: 4000, h: 200 },
  { key: "square", w: 1024, h: 1024 },
  { key: "tall-selfie", w: 600, h: 1600 },
  { key: "wide-banner", w: 1600, h: 600 },
] as const;

const BREAKPOINTS = [
  { name: "mobile", w: 375 },
  { name: "tablet", w: 820 },
  { name: "desktop", w: 1366 },
] as const;

function svgDataUrl(w: number, h: number) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'><rect width='${w}' height='${h}' fill='#000'/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function setViewport(width: number) {
  Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
}

describe("PolaroidAvatar matrix (size × aspect × breakpoint)", () => {
  for (const size of SIZES) {
    for (const bp of BREAKPOINTS) {
      for (const aspect of ASPECTS) {
        it(`size="${size}" bp=${bp.name} aspect=${aspect.key}`, () => {
          setViewport(bp.w);
          const { container } = render(
            <PolaroidAvatar
              size={size}
              src={svgDataUrl(aspect.w, aspect.h)}
              alt={`${aspect.key} upload`}
              caption="Test"
            />,
          );

          const root = container.querySelector(".polaroid-avatar") as HTMLElement;
          expect(root, "polaroid root must mount").toBeTruthy();

          // Contract 1: width === font-size === clamp(min, vw, max)
          const widthExpr = root.style.width;
          const fontExpr = root.style.fontSize;
          expect(widthExpr).toBe(fontExpr);
          const expected = SIZE_CLAMP[size];
          expect(widthExpr).toContain(`${expected.min}px`);
          expect(widthExpr).toContain(`${expected.max}px`);
          expect(widthExpr).toMatch(/^clamp\(/);

          // Contract 2: outer wrapper cannot push past its parent.
          expect(root.className).toMatch(/inline-block/);
          expect(root.className).toMatch(/flex-shrink-0/);
          expect(root.className).toMatch(/max-w-full/);

          // Contract 3: photo area is square and clips uploaded image.
          const photo = root.querySelector(":scope > div") as HTMLElement;
          expect(photo, "photo area must exist").toBeTruthy();
          expect(photo.className).toMatch(/overflow-hidden/);
          expect(photo.className).toMatch(/aspect-square/);
          expect(photo.style.aspectRatio).toBe("1 / 1");

          const img = photo.querySelector("img") as HTMLImageElement;
          expect(img, "uploaded <img> must render").toBeTruthy();
          expect(img.className).toMatch(/absolute/);
          expect(img.className).toMatch(/inset-0/);
          expect(img.className).toMatch(/object-cover/);
          expect(img.className).toMatch(/w-full/);
          expect(img.className).toMatch(/h-full/);
          // The image src must be the uploaded source (not the icon fallback).
          expect(img.getAttribute("src")).toContain("data:image/svg+xml");
        });
      }
    }
  }

  it("falls back to the paper-plane icon when src is missing — no <img> rendered", () => {
    const { container } = render(<PolaroidAvatar size="md" />);
    const root = container.querySelector(".polaroid-avatar")!;
    expect(root.querySelector("img")).toBeNull();
    expect(root.querySelector("svg")).toBeTruthy();
  });

  it("source contract: PolaroidAvatar component preserves containment styles", async () => {
    // Lock the source — if any of these are removed, the entire matrix is moot.
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const file = await fs.readFile(
      path.resolve(process.cwd(), "src/components/ui/polaroid-avatar.tsx"),
      "utf8",
    );
    for (const prop of [
      /aspect-square/,
      /aspectRatio:\s*["']1\s*\/\s*1["']/,
      /object-cover/,
      /absolute\s+inset-0/,
      /max-w-full/,
      /overflow-hidden/,
    ]) {
      expect(file).toMatch(prop);
    }
  });
});