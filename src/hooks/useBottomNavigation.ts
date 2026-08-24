import { useCallback } from "react";
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
const TAB_PATHS: Record<Exclude<NavTab, "map">, string> = {
  deals: "/deals",
  notifications: "/alerts",
  favorites: "/favorites",
  social: "/social",
};

/**
 * Query params each tab actually reads. `q` is the shared search term; the
 * map owns venue/deal deep links and its layer + time-lapse state.
 */
const SHARED_PARAMS = ["q"];
const ALLOWED_PARAMS: Record<NavTab, Set<string>> = {
  map: new Set([
    ...SHARED_PARAMS,
    "venue",
    "deal",
    "layers",
    "cat",
    "pathTime",
    "city",
  ]),
  deals: new Set([...SHARED_PARAMS, "deal", "cat"]),
  notifications: new Set([...SHARED_PARAMS]),
  favorites: new Set([...SHARED_PARAMS]),
  social: new Set([...SHARED_PARAMS]),
};

/** Reverse lookup: URL pathname -> tab. `/` is the map. */
export function tabFromPathname(
  pathname: string,
  fallback: NavTab = "map",
): NavTab {
  if (pathname === "/") return "map";
  const entry = (
    Object.entries(TAB_PATHS) as [Exclude<NavTab, "map">, string][]
  ).find(([, path]) => pathname === path || pathname.startsWith(`${path}/`));
  return entry ? entry[0] : fallback;
}

export function useBottomNavigation(options: UseBottomNavigationOptions = {}) {
  const { defaultTab = "map", onBeforeNavigate } = options;
  const navigate = useNavigate();
  const location = useLocation();

  // The URL is the single source of truth for the active tab. Deriving it on
  // every render (instead of mirroring it into state) keeps refresh, deep
  // links, and back/forward from ever painting the wrong tab.
  const activeTab = tabFromPathname(location.pathname, defaultTab);

  const buildTarget = useCallback(
    (tab: NavTab) => {
      // Carry only the params the DESTINATION understands. Dragging map-only
      // state (venue, layers, pathTime, cat) onto /deals or /alerts made those
      // routes boot with a deep link to resolve and re-resolve on the way
      // back, which is what made tab switches feel like they lagged.
      const params = new URLSearchParams(location.search);
      const allowed = ALLOWED_PARAMS[tab];
      for (const key of Array.from(params.keys())) {
        if (!allowed.has(key)) params.delete(key);
      }
      // `tab` was the legacy Index sub-view param — never carry it forward.
      params.delete("tab");
      const search = params.toString();
      const path = tab === "map" ? "/" : TAB_PATHS[tab];
      return `${path}${search ? `?${search}` : ""}`;
    },
    [location.search],
  );

  const goToTab = useCallback(
    (tab: NavTab) => {
      if (tab === activeTab) return;
      navigate(buildTarget(tab));
    },
    [activeTab, buildTarget, navigate],
  );

  const handleTabChange = useCallback(
    (tab: NavTab) => {
      // Allow parent to intercept navigation
      if (onBeforeNavigate && onBeforeNavigate(tab) === false) {
        return;
      }
      goToTab(tab);
    },
    [goToTab, onBeforeNavigate],
  );

  return {
    activeTab,
    /** Compat: switching "tabs" now means navigating to that tab's route. */
    setActiveTab: goToTab,
    handleTabChange,
  };
}

