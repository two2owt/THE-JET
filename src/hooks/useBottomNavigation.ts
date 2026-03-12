import { useState, useCallback, useEffect } from "react";
import { useNavigate, useLocation } from "react-router";

export type NavTab = "map" | "explore" | "notifications" | "favorites" | "social";

interface UseBottomNavigationOptions {
  /** The default tab when on this page */
  defaultTab?: NavTab;
  /** Called before navigation - can prevent navigation by returning false */
  onBeforeNavigate?: (tab: NavTab) => boolean | void;
}

/**
 * Centralized navigation hook for BottomNav across all pages.
 * Ensures consistent navigation behavior and URL handling.
 */
export function useBottomNavigation(options: UseBottomNavigationOptions = {}) {
  const { defaultTab = "map", onBeforeNavigate } = options;
  const navigate = useNavigate();
  const location = useLocation();

  // Determine initial tab from URL or default
  const getTabFromLocation = useCallback((): NavTab => {
    // If we're on a dedicated page, use that as the tab
    if (location.pathname === "/favorites") return "favorites";
    if (location.pathname === "/social") return "social";
    
    // Otherwise check URL params for Index page tabs
    const searchParams = new URLSearchParams(location.search);
    const tabParam = searchParams.get("tab");
    if (tabParam === "explore") return "explore";
    if (tabParam === "notifications") return "notifications";
    
    return defaultTab;
  }, [location.pathname, location.search, defaultTab]);

  const [activeTab, setActiveTab] = useState<NavTab>(getTabFromLocation);

  // Sync activeTab with URL when navigating back/forward (browser history)
  useEffect(() => {
    const newTab = getTabFromLocation();
    if (newTab !== activeTab) {
      setActiveTab(newTab);
    }
  }, [location.pathname, location.search, getTabFromLocation]);

  const handleTabChange = useCallback((tab: NavTab) => {
    // Allow parent to intercept navigation
    if (onBeforeNavigate && onBeforeNavigate(tab) === false) {
      return;
    }

    setActiveTab(tab);

    // Navigate based on tab
    switch (tab) {
      case "map":
        navigate("/", { replace: true });
        break;
      case "explore":
        navigate("/?tab=explore", { replace: true });
        break;
      case "notifications":
        navigate("/?tab=notifications", { replace: true });
        break;
      case "favorites":
        navigate("/favorites");
        break;
      case "social":
        navigate("/social");
        break;
    }
  }, [navigate, onBeforeNavigate]);

  return {
    activeTab,
    setActiveTab,
    handleTabChange,
  };
}
