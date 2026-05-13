import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { LuxeAvatar } from "@/components/ui/luxe-avatar";

/**
 * Visual-contract regression tests for `LuxeAvatar`.
 *
 * jsdom does not paint, so we cannot measure pixels — but the circle shape
 * is fully determined by a small set of CSS guarantees that we lock here.
 * If any future styling change breaks one of these, the avatar can no
 * longer be guaranteed circular and this suite fails.
 *
 * Contract under test (outer wrapper):
 *   1. `rounded-full`     → border-radius: 9999px
 *   2. `aspect-square`    → aspect-ratio: 1/1 (utility class)
 *   3. inline `aspectRatio: "1 / 1"` → cannot be overridden by callers
 *   4. matching width/height classes (square footprint)
 *
 * Inner layers (dark gap + Avatar + AvatarFallback) must also be
 * `rounded-full` so the silhouette is circular at every depth.
 */

const SIZES = ["xs", "sm", "md", "lg", "xl", "2xl"] as const;

const SIZE_TO_CLASS: Record<(typeof SIZES)[number], string> = {
  xs: "w-7 h-7",
  sm: "w-9 h-9",
  md: "w-11 h-11",
  lg: "w-16 h-16",
  xl: "w-24 h-24",
  "2xl": "w-28 h-28",
};

function getRoot(container: HTMLElement) {
  const root = container.querySelector(".luxe-avatar") as HTMLElement | null;
  if (!root) throw new Error("LuxeAvatar root not found");
  return root;
}

describe("LuxeAvatar — circle shape contract", () => {
  describe("mismatched width/height classes still render 1:1", () => {
    const MISMATCHES: Array<{ name: string; className: string }> = [
      { name: "w-20 h-40 (2x taller)", className: "w-20 h-40" },
      { name: "w-40 h-10 (4x wider)", className: "w-40 h-10" },
      { name: "w-8 h-24 (3x taller)", className: "w-8 h-24" },
      { name: "w-32 h-12 (wide rect)", className: "w-32 h-12" },
    ];

    for (const { name, className } of MISMATCHES) {
      it(`${name} — inline aspect-ratio + aspect-square keep box square`, () => {
        const { container } = render(
          <LuxeAvatar alt="t" className={className} />,
        );
        const root = getRoot(container);

        // Inline aspect-ratio style is the un-overridable runtime guard.
        expect(root.style.aspectRatio.replace(/\s+/g, "")).toBe("1/1");
        // Tailwind utility class as belt-and-braces backup.
        expect(root.className).toMatch(/\baspect-square\b/);
        // The mismatched caller classes are still applied (we did not strip
        // them) — proving the shape guarantee comes from the component's
        // own style, not from sanitising caller input.
        for (const cls of className.split(/\s+/)) {
          expect(root.className).toContain(cls);
        }
        // Outer wrapper, dark gap and inner Avatar are all rounded-full so
        // the silhouette is a circle at every layer.
        expect(root.className).toMatch(/\brounded-full\b/);
        const gap = root.firstElementChild as HTMLElement;
        expect(gap.className).toMatch(/\brounded-full\b/);
        const inner = gap.firstElementChild as HTMLElement;
        expect(inner.className).toMatch(/\brounded-full\b/);
        expect(inner.className).toMatch(/\baspect-square\b/);

        // No inline width/height escape hatches that could defeat the
        // aspect-ratio guard.
        expect(root.style.width).toBe("");
        expect(root.style.height).toBe("");
      });
    }
  });

  for (const size of SIZES) {
    it(`size="${size}" preserves circular contract`, () => {
      const { container } = render(<LuxeAvatar size={size} alt="t" />);
      const root = getRoot(container);

      // 1. Outer wrapper border-radius + aspect ratio
      expect(root.className).toMatch(/\brounded-full\b/);
      expect(root.className).toMatch(/\baspect-square\b/);
      // 2. Square footprint via Tailwind size class
      expect(root.className).toContain(SIZE_TO_CLASS[size]);
      // 3. Inline aspect-ratio guard (un-overridable by caller classes)
      expect(root.style.aspectRatio.replace(/\s+/g, "")).toBe("1/1");

      // 4. Inner dark-gap layer is rounded
      const gap = root.firstElementChild as HTMLElement;
      expect(gap.className).toMatch(/\brounded-full\b/);

      // 5. Inner Avatar (Radix root) is rounded + square
      const inner = gap.firstElementChild as HTMLElement;
      expect(inner.className).toMatch(/\brounded-full\b/);
      expect(inner.className).toMatch(/\baspect-square\b/);
    });
  }

  it("caller className with mismatched w/h cannot break aspect ratio", () => {
    // Even if a caller passes a malformed size class, the inline
    // `aspectRatio: 1/1` keeps the box square.
    const { container } = render(
      <LuxeAvatar alt="t" className="w-20 h-40" />,
    );
    const root = getRoot(container);
    expect(root.style.aspectRatio.replace(/\s+/g, "")).toBe("1/1");
    expect(root.className).toMatch(/\brounded-full\b/);
    expect(root.className).toMatch(/\baspect-square\b/);
  });

  it("renders paper-plane fallback for unauthenticated / no-image users", () => {
    const { container } = render(
      <LuxeAvatar forceIconFallback alt="Sign in" />,
    );
    // The Send (paper-plane) icon is the only <svg> rendered in fallback mode.
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
  });

  it("source contract: outer wrapper still inlines aspect-ratio guard", async () => {
    // Locks the source so future refactors can't silently drop the inline
    // aspect-ratio (which is what makes the className-based class redundant
    // and un-overridable).
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const file = await fs.readFile(
      path.resolve(process.cwd(), "src/components/ui/luxe-avatar.tsx"),
      "utf8",
    );
    expect(file).toMatch(/aspectRatio:\s*['"]1\s*\/\s*1['"]/);
    expect(file).toMatch(/aspect-square/);
    expect(file).toMatch(/rounded-full/);
  });
});
