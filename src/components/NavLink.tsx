import { NavLink as RouterNavLink, type NavLinkProps } from "react-router";
import { forwardRef, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";

// Route import map for prefetching - includes Index for back navigation
const ROUTE_IMPORTS: Record<string, () => Promise<unknown>> = {
  "/": () => import("@/pages/Index"),
  "/favorites": () => import("@/pages/Favorites"),
  "/social": () => import("@/pages/Social"),
  "/profile": () => import("@/pages/Profile"),
  "/settings": () => import("@/pages/Settings"),
  "/auth": () => import("@/pages/Auth"),
  "/onboarding": () => import("@/pages/Onboarding"),
  "/privacy-policy": () => import("@/pages/PrivacyPolicy"),
  "/terms-of-service": () => import("@/pages/TermsOfService"),
};

interface NavLinkCompatProps extends Omit<NavLinkProps, "className"> {
  className?: string;
  activeClassName?: string;
  pendingClassName?: string;
}

const NavLink = forwardRef<HTMLAnchorElement, NavLinkCompatProps>(
  ({ className, activeClassName, pendingClassName, to, ...props }, ref) => {
    const prefetched = useRef(false);
    
    // Prefetch the route chunk on hover/focus
    const handlePrefetch = useCallback(() => {
      if (prefetched.current) return;
      
      const path = typeof to === "string" ? to : to.pathname;
      if (path && ROUTE_IMPORTS[path]) {
        prefetched.current = true;
        ROUTE_IMPORTS[path]().catch(() => {});
      }
    }, [to]);
    
    return (
      <RouterNavLink
        ref={ref}
        to={to}
        className={({ isActive, isPending }) =>
          cn(className, isActive && activeClassName, isPending && pendingClassName)
        }
        onMouseEnter={handlePrefetch}
        onFocus={handlePrefetch}
        onTouchStart={handlePrefetch}
        {...props}
      />
    );
  },
);

NavLink.displayName = "NavLink";

export { NavLink };
