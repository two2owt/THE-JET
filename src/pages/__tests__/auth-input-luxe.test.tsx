import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render } from "@testing-library/react";
import { Input } from "@/components/ui/input";

const AUTH_SRC = readFileSync(
  resolve(__dirname, "../Auth.tsx"),
  "utf8",
);

/**
 * Guards the Auth page Input styling contract:
 * - No `border-border` / `border-input` overrides should leak back in
 *   (the base <Input/> owns the luxe hairline border).
 * - The base <Input/> must render with the hairline rgba border + elevated
 *   popover surface so focus/hover/disabled states inherit consistently.
 */
describe("Auth page Input — luxe border contract", () => {
  it("Auth.tsx contains no border-border/border-input overrides on Inputs", () => {
    // Strip block + line comments so doc references don't trip the guard.
    const stripped = AUTH_SRC
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");

    expect(stripped).not.toMatch(/\bborder-border\b/);
    expect(stripped).not.toMatch(/\bborder-input\b/);
  });

  it("only conditional border overrides are validation states (border-destructive)", () => {
    // Any `border-<token>` class applied to an Input on this page must be
    // either `border-destructive` (validation error) or a structural wrapper
    // class — never a generic `border-border` / `border-input` override.
    const inputBorderOverrides = AUTH_SRC.match(
      /<Input[^>]*className=\{?["'`][^"'`]*\bborder-(?!destructive\b)[a-z][\w/-]*/g,
    );
    expect(inputBorderOverrides).toBeNull();
  });

  it("base <Input/> renders the luxe hairline border + popover surface", () => {
    const { container } = render(<Input data-testid="luxe-input" />);
    const el = container.querySelector<HTMLInputElement>(
      '[data-testid="luxe-input"]',
    );
    expect(el).not.toBeNull();

    // Inline luxe styling — these are the source of truth for focus/hover/
    // disabled transitions, so any border override on Auth would fight them.
    expect(el!.style.border).toContain("hsl(0 0% 100% / 0.06)");
    expect(el!.style.background).toContain("hsl(var(--popover) / 0.6)");
    expect(el!.style.transition).toContain("border-color");
  });

  it("base <Input/> exposes focus-visible + disabled utility classes", () => {
    const { container } = render(<Input data-testid="luxe-input" />);
    const el = container.querySelector<HTMLInputElement>(
      '[data-testid="luxe-input"]',
    )!;
    const cls = el.className;

    expect(cls).toMatch(/focus-visible:outline-none/);
    expect(cls).toMatch(/focus-visible:ring-2/);
    expect(cls).toMatch(/focus-visible:ring-ring/);
    expect(cls).toMatch(/disabled:opacity-50/);
    expect(cls).toMatch(/disabled:cursor-not-allowed/);
  });
});