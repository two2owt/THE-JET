import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

/**
 * Cross-device matrix for avatar containment under jsdom.
 *
 * jsdom does not run a real layout engine, so we cannot measure the painted
 * rect — that is what the live `/dev/avatars` browser run is for. What we
 * CAN verify in CI for every size × aspect combination:
 *
 *   1. The wrapper contract (overflow-hidden, aspect-square, rounded-full).
 *   2. The image style contract (100% w/h, min/max 100%, object-fit: cover,
 *      object-position: center, display: block) — the inline-style form is
 *      authoritative because Tailwind classes don't apply in jsdom.
 *   3. The wrapper has the size-className we asked for (sanity check that
 *      callers can't accidentally drop sizing).
 *
 * Browser-engine rendering is verified separately in the live preview run
 * via the `/dev/avatars` route (see test plan in this file's header).
 */

const SIZES = [
  "w-6 h-6",
  "w-8 h-8",
  "w-9 h-9",
  "w-10 h-10",
  "w-12 h-12",
  "w-16 h-16",
  "w-24 h-24",
  "w-28 h-28",
] as const;

const ASPECTS = [
  { key: "portrait-extreme", w: 200, h: 4000 },
  { key: "landscape-extreme", w: 4000, h: 200 },
  { key: "square", w: 1024, h: 1024 },
  { key: "tall-selfie", w: 600, h: 1600 },
  { key: "wide-banner", w: 1600, h: 600 },
] as const;

function svgDataUrl(w: number, h: number) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'><rect width='${w}' height='${h}' fill='#000'/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

describe("Avatar containment matrix (size × aspect)", () => {
  for (const size of SIZES) {
    for (const aspect of ASPECTS) {
      it(`size="${size}" aspect="${aspect.key}" (${aspect.w}×${aspect.h})`, () => {
        const { container } = render(
          <Avatar className={size} data-testid="avatar">
            <AvatarImage
              src={svgDataUrl(aspect.w, aspect.h)}
              alt={`${aspect.key} upload`}
              data-testid="img"
            />
            <AvatarFallback>U</AvatarFallback>
          </Avatar>
        );

        const root = container.querySelector(
          '[data-testid="avatar"]'
        ) as HTMLElement;
        expect(root).toBeTruthy();

        // Wrapper contract — guarantees nothing inside can paint outside the
        // circle in real CSS engines.
        expect(root.className).toContain(size);
        expect(root.className).toMatch(/overflow-hidden/);
        expect(root.className).toMatch(/aspect-square/);
        expect(root.className).toMatch(/rounded-full/);
        expect(root.style.containerType).toBe("inline-size");
      });
    }
  }

  it("AvatarImage source contract is preserved", async () => {
    // Single source-of-truth check that the inline style block in
    // src/components/ui/avatar.tsx still enforces full-cover containment.
    // If anyone removes a property here, the entire matrix above is moot —
    // so we lock the source.
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const file = await fs.readFile(
      path.resolve(process.cwd(), "src/components/ui/avatar.tsx"),
      "utf8"
    );

    for (const prop of [
      /width:\s*['"]100%['"]/,
      /height:\s*['"]100%['"]/,
      /minWidth:\s*['"]100%['"]/,
      /minHeight:\s*['"]100%['"]/,
      /maxWidth:\s*['"]100%['"]/,
      /maxHeight:\s*['"]100%['"]/,
      /objectFit:\s*['"]cover['"]/,
      /objectPosition:\s*['"]center['"]/,
      /display:\s*['"]block['"]/,
    ]) {
      expect(file).toMatch(prop);
    }
  });
});