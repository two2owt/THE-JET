import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { Header } from "../Header";
import { HeaderProvider } from "@/contexts/HeaderContext";

// ─── Supabase mock ──────────────────────────────────────────────────────────
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null }),
    })),
  },
}));

// ─── Helpers ────────────────────────────────────────────────────────────────
/**
 * Set the viewport width and trigger matchMedia + resize so `useIsMobile`
 * picks up the new size synchronously.
 */
const setViewport = (width: number) => {
  Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, writable: true, value: 800 });
  // Re-stub matchMedia so `(max-width: 767px)` matches correctly for mobile breakpoint.
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => {
      const m = query.match(/max-width:\s*(\d+)px/);
      const max = m ? parseInt(m[1], 10) : Number.POSITIVE_INFINITY;
      return {
        matches: width <= max,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      };
    },
  });
  act(() => {
    window.dispatchEvent(new Event("resize"));
  });
};

const renderHeader = () =>
  render(
    <MemoryRouter initialEntries={["/"]}>
      <HeaderProvider>
        <Header />
      </HeaderProvider>
    </MemoryRouter>
  );

/**
 * Resolve the effective right-edge padding the input reserves for trailing
 * buttons (close + clear). We read it directly from inline style so we don't
 * depend on jsdom's missing layout engine.
 */
const getInputPaddingRight = (input: HTMLInputElement): number => {
  const px = input.style.paddingRight || "0";
  return parseFloat(px);
};

/**
 * Resolve the right-offset (distance from the input's right edge) where a
 * trailing button starts, using its inline `right` style + width.
 */
const getButtonRightExtent = (btn: HTMLElement): { right: number; width: number; leftEdgeFromRight: number } => {
  const right = parseFloat(btn.style.right || "0");
  const width = parseFloat(btn.style.width || "0");
  // The button's left edge measured from the input's right edge is right + width.
  return { right, width, leftEdgeFromRight: right + width };
};

const SAFETY_GAP_PX = 4; // minimum visual breathing room between text and buttons

// ─── Tests ──────────────────────────────────────────────────────────────────
describe("Header search — clear/close buttons never overlap input text", () => {
  beforeEach(() => {
    // Default to desktop; individual tests override.
    setViewport(1280);
  });

  afterEach(() => {
    cleanup();
  });

  it("desktop, no query: no trailing buttons, padding-right keeps text away from edge", async () => {
    setViewport(1280);
    renderHeader();
    const input = (await screen.findByLabelText("Search venues and deals")) as HTMLInputElement;

    expect(screen.queryByLabelText("Clear search")).toBeNull();
    expect(screen.queryByLabelText("Close search")).toBeNull();
    // Default safe padding for an empty desktop input.
    expect(getInputPaddingRight(input)).toBeGreaterThanOrEqual(16);
  });

  it("desktop, with query: clear button sits inside reserved padding, no overlap", async () => {
    setViewport(1280);
    renderHeader();
    const input = (await screen.findByLabelText("Search venues and deals")) as HTMLInputElement;

    fireEvent.change(input, { target: { value: "burger" } });

    const clear = screen.getByLabelText("Clear search");
    const padR = getInputPaddingRight(input);
    const { leftEdgeFromRight } = getButtonRightExtent(clear);

    // The button's left edge (measured from the input's right edge) must be
    // <= the reserved padding minus a safety gap, otherwise the button would
    // intrude into the visible text area.
    expect(leftEdgeFromRight).toBeLessThanOrEqual(padR - SAFETY_GAP_PX);
    // And padding must be enough to host the button width + its right inset.
    expect(padR).toBeGreaterThanOrEqual(leftEdgeFromRight + SAFETY_GAP_PX);
  });

  it("mobile collapsed: search icon shown, no input rendered, so no overlap risk", async () => {
    setViewport(375);
    renderHeader();
    expect(await screen.findByLabelText("Open search")).toBeInTheDocument();
    expect(screen.queryByLabelText("Search venues and deals")).toBeNull();
  });

  it("mobile expanded, no query: only close button, padding-right reserves room for it", async () => {
    setViewport(375);
    renderHeader();
    const openBtn = await screen.findByLabelText("Open search");
    fireEvent.click(openBtn);

    const input = (await screen.findByLabelText("Search venues and deals")) as HTMLInputElement;
    const close = screen.getByLabelText("Close search");

    expect(screen.queryByLabelText("Clear search")).toBeNull();

    const padR = getInputPaddingRight(input);
    const { leftEdgeFromRight } = getButtonRightExtent(close);

    expect(padR).toBeGreaterThanOrEqual(leftEdgeFromRight + SAFETY_GAP_PX);
  });

  it("mobile expanded, with query: clear + close buttons both sit inside reserved padding without overlapping each other or the text", async () => {
    setViewport(375);
    renderHeader();
    const openBtn = await screen.findByLabelText("Open search");
    fireEvent.click(openBtn);

    const input = (await screen.findByLabelText("Search venues and deals")) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "tacos" } });

    const clear = screen.getByLabelText("Clear search");
    const close = screen.getByLabelText("Close search");

    const padR = getInputPaddingRight(input);
    const clearGeom = getButtonRightExtent(clear);
    const closeGeom = getButtonRightExtent(close);

    // Both buttons must fit within reserved padding (no intrusion into text).
    expect(padR).toBeGreaterThanOrEqual(clearGeom.leftEdgeFromRight + SAFETY_GAP_PX);
    expect(padR).toBeGreaterThanOrEqual(closeGeom.leftEdgeFromRight + SAFETY_GAP_PX);

    // Buttons must not overlap each other:
    //   close occupies [close.right, close.right + close.width]
    //   clear occupies [clear.right, clear.right + clear.width]
    // Both measured from the input's right edge. They overlap iff their
    // intervals intersect.
    const closeStart = closeGeom.right;
    const closeEnd = closeGeom.right + closeGeom.width;
    const clearStart = clearGeom.right;
    const clearEnd = clearGeom.right + clearGeom.width;
    const overlaps = !(clearEnd <= closeStart || closeEnd <= clearStart);
    expect(overlaps).toBe(false);
  });

  it("clearing the query restores the smaller padding-right (no leftover reserved space)", async () => {
    setViewport(1280);
    renderHeader();
    const input = (await screen.findByLabelText("Search venues and deals")) as HTMLInputElement;

    fireEvent.change(input, { target: { value: "pizza" } });
    const padWithQuery = getInputPaddingRight(input);

    fireEvent.click(screen.getByLabelText("Clear search"));
    const padAfterClear = getInputPaddingRight(input);

    expect(padWithQuery).toBeGreaterThan(padAfterClear);
  });
});