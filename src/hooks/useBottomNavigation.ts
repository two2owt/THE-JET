import { useState, useCallback, useEffect } from "react";
import { useNavigate, useLocation } from "@/lib/router-compat";

export type NavTab =
  "map" | "deals" | "notifications" | "favorites" | "social";

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
    if (location.pathname === "/deals") return "deals";
    if (location.pathname === "/alerts") return "notifications";

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

  const handleTabChange = useCallback(
    (tab: NavTab) => {
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
        case "deals":
          // `tab` only addresses Index sub-tabs — don't drag it onto /deals.
          params.delete("tab");
          navigate(`/deals${params.toString() ? `?${params.toString()}` : ""}`);
          return;
        case "notifications":
          // `tab` only addresses Index sub-tabs — don't drag it onto /alerts.
          params.delete("tab");
          navigate(`/alerts${params.toString() ? `?${params.toString()}` : ""}`);
          return;
        case "favorites":
          // `tab` only addresses Index sub-tabs — don't drag it onto other pages.
          params.delete("tab");
          navigate(
            `/favorites${params.toString() ? `?${params.toString()}` : ""}`,
          );
          return;
        case "social":
          params.delete("tab");
          navigate(
            `/social${params.toString() ? `?${params.toString()}` : ""}`,
          );
          return;
      }
      const search = params.toString();
      navigate(`/${search ? `?${search}` : ""}`, { replace: true });
    },
    [navigate, onBeforeNavigate, location.search],
  );

  return {
    activeTab,
    setActiveTab,
    handleTabChange,
  };
}
