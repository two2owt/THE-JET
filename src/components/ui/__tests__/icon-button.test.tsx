import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { IconButton } from "@/components/ui/icon-button";
import { Eye } from "lucide-react";

describe("IconButton", () => {
  it("renders with required ariaLabel", () => {
    render(<IconButton ariaLabel="Show password"><Eye /></IconButton>);
    expect(screen.getByRole("button", { name: "Show password" })).toBeInTheDocument();
  });

  it("reflects aria-pressed state", () => {
    const { rerender } = render(<IconButton ariaLabel="Toggle" ariaPressed={false}><Eye /></IconButton>);
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "false");
    rerender(<IconButton ariaLabel="Toggle" ariaPressed={true}><Eye /></IconButton>);
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
  });

  it("applies disabled state and prevents clicks", () => {
    const onClick = vi.fn();
    render(<IconButton ariaLabel="Disabled" disabled onClick={onClick}><Eye /></IconButton>);
    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
    expect(btn.className).toMatch(/disabled:opacity-50/);
    expect(btn.className).toMatch(/disabled:pointer-events-none/);
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("includes focus-visible ring and touch-manipulation classes", () => {
    render(<IconButton ariaLabel="Focus test"><Eye /></IconButton>);
    const btn = screen.getByRole("button");
    expect(btn.className).toMatch(/focus-visible:ring-2/);
    expect(btn.className).toMatch(/focus-visible:ring-primary/);
    expect(btn.className).toMatch(/touch-manipulation/);
  });

  it("meets 44x44 minimum touch target by default", () => {
    render(<IconButton ariaLabel="Touch target"><Eye /></IconButton>);
    const btn = screen.getByRole("button");
    expect(btn.className).toMatch(/min-h-\[44px\]/);
    expect(btn.className).toMatch(/min-w-\[44px\]/);
  });

  it("defaults to type=button to avoid form submission", () => {
    render(<IconButton ariaLabel="Type test"><Eye /></IconButton>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "button");
  });

  it("applies hover styles for default variant", () => {
    render(<IconButton ariaLabel="Hover test"><Eye /></IconButton>);
    const btn = screen.getByRole("button");
    expect(btn.className).toMatch(/hover:bg-primary\/10/);
    expect(btn.className).toMatch(/hover:text-primary/);
  });
});
