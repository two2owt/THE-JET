import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Header } from "../Header";
import { Footer } from "../Footer";
import { BottomNav } from "../BottomNav";
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
const renderWithRouter = (ui: React.ReactElement, route = "/settings") =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <HeaderProvider>{ui}</HeaderProvider>
    </MemoryRouter>
  );

// ─── Header ─────────────────────────────────────────────────────────────────
describe("Header – inline layout styles", () => {
  it("renders with position:fixed and z-index via inline styles", () => {
    renderWithRouter(<Header />);
    const header = screen.getByRole("banner");
    expect(header.style.position).toBe("fixed");
    expect(header.style.top).toBe("0px");
    expect(header.style.left).toBe("0px");
    expect(header.style.right).toBe("0px");
    expect(header.style.zIndex).toBe("60");
  });

  it("uses CSS variable for header height", () => {
    renderWithRouter(<Header />);
    const header = screen.getByRole("banner");
    const styleAttr = header.getAttribute("style") || "";
    expect(styleAttr).toContain("--header-total-height");
  });

  it("inner container has flex layout via inline styles", () => {
    renderWithRouter(<Header />);
    const header = screen.getByRole("banner");
    // First child div inside header (after background layers) is the flex container
    const flexContainer = header.querySelector("[style*='display: flex'][style*='height: 100%']");
    expect(flexContainer).not.toBeNull();
    expect((flexContainer as HTMLElement).style.display).toBe("flex");
    expect((flexContainer as HTMLElement).style.alignItems).toBe("center");
  });

  it("contains the JET brand logo", () => {
    renderWithRouter(<Header />);
    expect(screen.getByText("JET")).toBeInTheDocument();
  });

  it("contains settings avatar button", () => {
    renderWithRouter(<Header />);
    expect(screen.getByLabelText("Open settings")).toBeInTheDocument();
  });

  it("has search input on pages that don't hide it", () => {
    renderWithRouter(<Header />, "/settings");
    // Settings hides search via PageLayout, but Header renders search by default
    const search = screen.getByPlaceholderText("Search venues...");
    expect(search).toBeInTheDocument();
  });
});

// ─── BottomNav ──────────────────────────────────────────────────────────────
describe("BottomNav – inline layout styles", () => {
  const defaultProps = {
    activeTab: "map" as const,
    onTabChange: vi.fn(),
    notificationCount: 0,
  };

  it("renders with position:fixed via className (no inline override needed for bottom)", () => {
    renderWithRouter(<BottomNav {...defaultProps} />);
    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    expect(nav).toBeInTheDocument();
    expect(nav.className).toContain("fixed");
  });

  it("uses CSS variable for nav height", () => {
    renderWithRouter(<BottomNav {...defaultProps} />);
    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    const styleAttr = nav.getAttribute("style") || "";
    expect(styleAttr).toContain("--bottom-nav-total-height");
  });

  it("inner container has flex + space-around via inline styles", () => {
    renderWithRouter(<BottomNav {...defaultProps} />);
    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    const spaceAround = nav.querySelector("[style*='justify-content: space-around']");
    expect(spaceAround).not.toBeNull();
    expect((spaceAround as HTMLElement).style.display).toBe("flex");
    expect((spaceAround as HTMLElement).style.width).toBe("100%");
  });

  it("renders all 5 navigation tabs", () => {
    renderWithRouter(<BottomNav {...defaultProps} />);
    expect(screen.getByLabelText("Map")).toBeInTheDocument();
    expect(screen.getByLabelText("Hot")).toBeInTheDocument();
    expect(screen.getByLabelText("Alerts")).toBeInTheDocument();
    expect(screen.getByLabelText("Saved")).toBeInTheDocument();
    expect(screen.getByLabelText("Crew")).toBeInTheDocument();
  });

  it("marks the active tab with aria-current", () => {
    renderWithRouter(<BottomNav {...defaultProps} activeTab="explore" />);
    expect(screen.getByLabelText("Hot")).toHaveAttribute("aria-current", "page");
    expect(screen.getByLabelText("Map")).not.toHaveAttribute("aria-current");
  });

  it("shows notification badge when count > 0", () => {
    renderWithRouter(<BottomNav {...defaultProps} notificationCount={5} />);
    expect(screen.getByLabelText(/Alerts, 5 unread/)).toBeInTheDocument();
  });
});

// ─── Footer ─────────────────────────────────────────────────────────────────
describe("Footer – inline layout styles & visibility", () => {
  it("is hidden on the map route (/)", () => {
    renderWithRouter(<Footer />, "/");
    expect(screen.queryByRole("contentinfo")).not.toBeInTheDocument();
  });

  it("is hidden on /auth", () => {
    renderWithRouter(<Footer />, "/auth");
    expect(screen.queryByRole("contentinfo")).not.toBeInTheDocument();
  });

  it("is hidden on /onboarding", () => {
    renderWithRouter(<Footer />, "/onboarding");
    expect(screen.queryByRole("contentinfo")).not.toBeInTheDocument();
  });

  it("renders on non-hidden routes", () => {
    renderWithRouter(<Footer />, "/settings");
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
  });

  it("has inline position:relative", () => {
    renderWithRouter(<Footer />, "/settings");
    const footer = screen.getByRole("contentinfo");
    expect(footer.style.position).toBe("relative");
  });

  it("icon links container uses flex + space-around via inline styles", () => {
    renderWithRouter(<Footer />, "/settings");
    const footer = screen.getByRole("contentinfo");
    const flexRow = footer.querySelector("[style*='justify-content: space-around']");
    expect(flexRow).not.toBeNull();
    expect((flexRow as HTMLElement).style.display).toBe("flex");
    expect((flexRow as HTMLElement).style.alignItems).toBe("center");
  });

  it("renders all 3 footer links with icons", () => {
    renderWithRouter(<Footer />, "/settings");
    expect(screen.getByLabelText("Contact")).toBeInTheDocument();
    expect(screen.getByLabelText("Privacy")).toBeInTheDocument();
    expect(screen.getByLabelText("Terms")).toBeInTheDocument();
  });

  it("Contact link points to the correct email", () => {
    renderWithRouter(<Footer />, "/settings");
    const contactLink = screen.getByLabelText("Contact");
    expect(contactLink).toHaveAttribute("href", "mailto:creativebreakroominfo@gmail.com");
  });

  it("Privacy and Terms are internal router links", () => {
    renderWithRouter(<Footer />, "/settings");
    const privacyLink = screen.getByLabelText("Privacy");
    const termsLink = screen.getByLabelText("Terms");
    expect(privacyLink).toHaveAttribute("href", "/privacy-policy");
    expect(termsLink).toHaveAttribute("href", "/terms-of-service");
  });

  it("displays current year in copyright", () => {
    renderWithRouter(<Footer />, "/settings");
    const year = new Date().getFullYear().toString();
    expect(screen.getByText(new RegExp(`© ${year}`))).toBeInTheDocument();
  });
});
