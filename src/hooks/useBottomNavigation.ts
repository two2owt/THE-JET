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

    // Preserve other query params (q, venue, layers, etc.) so search query,
    // open JetCard, and map filters survive tab changes and remain shareable.
    const params = new URLSearchParams(location.search);
    switch (tab) {
      case "map":
        params.delete("tab");
        break;
      case "explore":
        params.set("tab", "explore");
        break;
      case "notifications":
        params.set("tab", "notifications");
        break;
      case "favorites":
        navigate({ pathname: "/favorites", search: params.toString() ? `?${params.toString()}` : "" });
        return;
      case "social":
        navigate({ pathname: "/social", search: params.toString() ? `?${params.toString()}` : "" });
        return;
    }
    const search = params.toString();
    navigate({ pathname: "/", search: search ? `?${search}` : "" }, { replace: true });
  }, [navigate, onBeforeNavigate, location.search]);

  return {
    activeTab,
    setActiveTab,
    handleTabChange,
  };
}
