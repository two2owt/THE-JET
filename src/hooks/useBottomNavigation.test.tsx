import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { useBottomNavigation, type NavTab } from "./useBottomNavigation";

// Mock navigate function
const mockNavigate = vi.fn();

vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Wrapper component with router context
const createWrapper = (initialRoute: string = "/") => {
  return ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter initialEntries={[initialRoute]}>{children}</MemoryRouter>
  );
};

describe("useBottomNavigation", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  describe("initial state", () => {
    it("should initialize with default tab when no defaultTab provided", () => {
      const { result } = renderHook(() => useBottomNavigation(), {
        wrapper: createWrapper("/"),
      });

      expect(result.current.activeTab).toBe("map");
    });

    it("should initialize with provided defaultTab", () => {
      const { result } = renderHook(
        () => useBottomNavigation({ defaultTab: "explore" }),
        { wrapper: createWrapper("/?tab=explore") }
      );

      expect(result.current.activeTab).toBe("explore");
    });

    it("should detect map tab from root URL", () => {
      const { result } = renderHook(() => useBottomNavigation(), {
        wrapper: createWrapper("/"),
      });

      expect(result.current.activeTab).toBe("map");
    });

    it("should detect explore tab from URL search params", () => {
      const { result } = renderHook(() => useBottomNavigation(), {
        wrapper: createWrapper("/?tab=explore"),
      });

      expect(result.current.activeTab).toBe("explore");
    });

    it("should detect notifications tab from URL search params", () => {
      const { result } = renderHook(() => useBottomNavigation(), {
        wrapper: createWrapper("/?tab=notifications"),
      });

      expect(result.current.activeTab).toBe("notifications");
    });
  });

  describe("handleTabChange", () => {
    it("should navigate to root when map tab is selected", () => {
      const { result } = renderHook(() => useBottomNavigation(), {
        wrapper: createWrapper("/"),
      });

      act(() => {
        result.current.handleTabChange("map");
      });

      expect(mockNavigate).toHaveBeenCalledWith("/", { replace: true });
      expect(result.current.activeTab).toBe("map");
    });

    it("should navigate with tab=explore when explore is selected", () => {
      const { result } = renderHook(() => useBottomNavigation(), {
        wrapper: createWrapper("/"),
      });

      act(() => {
        result.current.handleTabChange("explore");
      });

      expect(mockNavigate).toHaveBeenCalledWith("/?tab=explore", { replace: true });
      expect(result.current.activeTab).toBe("explore");
    });

    it("should navigate with tab=notifications when notifications is selected", () => {
      const { result } = renderHook(() => useBottomNavigation(), {
        wrapper: createWrapper("/"),
      });

      act(() => {
        result.current.handleTabChange("notifications");
      });

      expect(mockNavigate).toHaveBeenCalledWith("/?tab=notifications", { replace: true });
      expect(result.current.activeTab).toBe("notifications");
    });

    it("should navigate to /?tab=explore when explore is selected", () => {
      const { result } = renderHook(() => useBottomNavigation(), {
        wrapper: createWrapper("/"),
      });

      act(() => {
        result.current.handleTabChange("explore");
      });

      expect(mockNavigate).toHaveBeenCalledWith("/?tab=explore", { replace: true });
      expect(result.current.activeTab).toBe("explore");
    });

  });

  describe("onBeforeNavigate callback", () => {
    it("should call onBeforeNavigate before navigation", () => {
      const onBeforeNavigate = vi.fn();
      const { result } = renderHook(
        () => useBottomNavigation({ onBeforeNavigate }),
        { wrapper: createWrapper("/") }
      );

      act(() => {
        result.current.handleTabChange("explore");
      });

      expect(onBeforeNavigate).toHaveBeenCalledWith("explore");
    });

    it("should prevent navigation when onBeforeNavigate returns false", () => {
      const onBeforeNavigate = vi.fn().mockReturnValue(false);
      const { result } = renderHook(
        () => useBottomNavigation({ onBeforeNavigate }),
        { wrapper: createWrapper("/") }
      );

      const initialTab = result.current.activeTab;

      act(() => {
        result.current.handleTabChange("explore");
      });

      expect(onBeforeNavigate).toHaveBeenCalledWith("explore");
      expect(mockNavigate).not.toHaveBeenCalled();
      expect(result.current.activeTab).toBe(initialTab);
    });

    it("should allow navigation when onBeforeNavigate returns undefined", () => {
      const onBeforeNavigate = vi.fn().mockReturnValue(undefined);
      const { result } = renderHook(
        () => useBottomNavigation({ onBeforeNavigate }),
        { wrapper: createWrapper("/") }
      );

      act(() => {
        result.current.handleTabChange("favorites");
      });

      expect(mockNavigate).toHaveBeenCalledWith("/favorites");
      expect(result.current.activeTab).toBe("favorites");
    });
  });

  describe("setActiveTab", () => {
    it("should allow direct setting of active tab without navigation", () => {
      const { result } = renderHook(() => useBottomNavigation(), {
        wrapper: createWrapper("/"),
      });

      act(() => {
        result.current.setActiveTab("explore");
      });

      expect(result.current.activeTab).toBe("explore");
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe("tab types", () => {
    it("should handle all valid NavTab values", () => {
      const tabs: NavTab[] = ["map", "explore", "notifications", "favorites"];
      const { result } = renderHook(() => useBottomNavigation(), {
        wrapper: createWrapper("/"),
      });

      tabs.forEach((tab) => {
        act(() => {
          result.current.handleTabChange(tab);
        });
        expect(result.current.activeTab).toBe(tab);
      });
    });
  });
});
