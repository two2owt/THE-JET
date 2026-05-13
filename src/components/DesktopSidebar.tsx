import { useLocation, useNavigate } from "react-router";
import {
  MapPinned,
  Flame,
  Bell,
  Heart,
  Users2,
  User as UserIcon,
  Settings as SettingsIcon,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/utils";

/**
 * Desktop-only sidebar shown on `lg+` (≥1024px) for the
 * Profile / Settings / Social pages. Below that breakpoint it is
 * `display: none` and the existing BottomNav is the only nav.
 *
 * Containment contract:
 *   • `position: fixed` — out of flow, never widens the document.
 *   • Width comes from `--desktop-sidebar-width` so PageLayout can
 *     reserve matching `padding-left` on the same media query.
 *   • Internal scroll is its own `overflow-y: auto`; never affects
 *     PageLayout's `<main>` overflow rules.
 */

const NAV_ITEMS = [
  { to: "/", icon: MapPinned, label: "Map" },
  { to: "/?tab=explore", icon: Flame, label: "Hot" },
  { to: "/?tab=notifications", icon: Bell, label: "Alerts" },
  { to: "/favorites", icon: Heart, label: "Saved" },
  { to: "/social", icon: Users2, label: "Crew" },
] as const;

const ACCOUNT_ITEMS = [
  { to: "/profile", icon: UserIcon, label: "Profile" },
  { to: "/settings", icon: SettingsIcon, label: "Settings" },
] as const;

const STORAGE_KEY = "jet:desktop-sidebar-collapsed";

export function DesktopSidebar() {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  });

  // Sync the actual width to the CSS var so PageLayout's padding-left
  // adapts whether the sidebar is expanded (240px) or collapsed (64px).
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty(
      "--desktop-sidebar-width",
      collapsed ? "64px" : "240px",
    );
    window.localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
    return () => {
      // Reset when sidebar unmounts so non-sidebar pages get 0.
      root.style.setProperty("--desktop-sidebar-width", "0px");
    };
  }, [collapsed]);

  const isActive = useCallback(
    (to: string) => {
      const [path, query = ""] = to.split("?");
      if (path !== pathname) return false;
      if (!query) return !search || search === "";
      const sp = new URLSearchParams(search);
      const target = new URLSearchParams(query);
      for (const [k, v] of target) if (sp.get(k) !== v) return false;
      return true;
    },
    [pathname, search],
  );

  return (
    <aside
      data-testid="desktop-sidebar"
      aria-label="Primary navigation"
      className="hidden lg:flex flex-col fixed left-0 z-40 border-r border-border/50 bg-background/85 backdrop-blur-xl"
      style={{
        top: "var(--header-total-height)",
        bottom: 0,
        width: "var(--desktop-sidebar-width, 240px)",
        transition: "width 200ms ease-out",
        overflowY: "auto",
        overflowX: "hidden",
        contain: "layout paint style",
      }}
    >
      <nav className="flex flex-col gap-1 px-3 py-4 flex-1 min-h-0">
        <SectionLabel collapsed={collapsed}>Navigate</SectionLabel>
        {NAV_ITEMS.map((item) => (
          <SidebarLink
            key={item.to}
            {...item}
            active={isActive(item.to)}
            collapsed={collapsed}
            onClick={() => navigate(item.to)}
          />
        ))}

        <div className="h-px bg-border/40 my-3" />

        <SectionLabel collapsed={collapsed}>Account</SectionLabel>
        {ACCOUNT_ITEMS.map((item) => (
          <SidebarLink
            key={item.to}
            {...item}
            active={isActive(item.to)}
            collapsed={collapsed}
            onClick={() => navigate(item.to)}
          />
        ))}
      </nav>

      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-pressed={collapsed}
        className="m-3 flex items-center justify-center gap-2 h-9 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {collapsed ? (
          <ChevronRight className="w-4 h-4" aria-hidden="true" />
        ) : (
          <>
            <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            <span>Collapse</span>
          </>
        )}
      </button>
    </aside>
  );
}

function SectionLabel({
  collapsed,
  children,
}: {
  collapsed: boolean;
  children: React.ReactNode;
}) {
  if (collapsed) return null;
  return (
    <div className="px-2 pt-1 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
      {children}
    </div>
  );
}

function SidebarLink({
  icon: Icon,
  label,
  active,
  collapsed,
  onClick,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  collapsed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      title={collapsed ? label : undefined}
      className={cn(
        "group relative flex items-center gap-3 h-10 rounded-lg px-3 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        active
          ? "text-primary bg-primary/10"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
        collapsed && "justify-center px-0",
      )}
    >
      {active && (
        <span
          aria-hidden="true"
          className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-primary"
        />
      )}
      <Icon className="w-5 h-5 flex-shrink-0" />
      {!collapsed && <span className="truncate">{label}</span>}
    </button>
  );
}