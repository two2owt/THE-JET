import { Fragment, useMemo } from "react";
import { Link, useLocation } from "react-router";
import { ChevronRight } from "lucide-react";

/**
 * Compact, SaaS-style breadcrumbs designed to live INSIDE the topbar,
 * inline next to the logo (Linear / Vercel / Notion pattern).
 *
 * Differences from {@link Breadcrumbs} (the fixed sub-bar):
 *  - No background, no border — meant to sit on the header surface
 *  - No leading Home icon (the logo already serves that role)
 *  - Only renders intermediate + current crumbs; root is implicit
 *  - Truncates with ellipsis when space is constrained
 */

const SEGMENT_LABELS: Record<string, string> = {
  profile: "Profile",
  favorites: "Saved",
  social: "Crew",
  messages: "Messages",
  admin: "Admin",
  "privacy-policy": "Privacy Policy",
  "terms-of-service": "Terms of Service",
  "verification-success": "Verification",
};

const HIDDEN_ROUTES = new Set(["/", "/auth", "/onboarding", "/favorites", "/social", "/profile", "/admin/dev", "/profile/settings", "/profile/settings/social", "/privacy-policy", "/terms-of-service", "/unsubscribe", "/verification-success"]);

/** Only these paths map to real routes; intermediate segments outside
 *  this set render as non-clickable text so users can't navigate to
 *  fabricated URLs like /profile/settings/social or /admin/dev. */
const VALID_PATHS = new Set([
  "/profile",
  "/favorites",
  "/social",
  "/messages",
  "/admin",
  "/privacy-policy",
  "/terms-of-service",
  "/verification-success",
  "/unsubscribe",
]);

const humanize = (slug: string): string =>
  slug
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());

interface Crumb {
  label: string;
  href: string;
  isCurrent: boolean;
  isValid: boolean;
}

export function InlineBreadcrumbs() {
  const { pathname } = useLocation();

  const crumbs = useMemo<Crumb[]>(() => {
    if (HIDDEN_ROUTES.has(pathname)) return [];
    const segments = pathname.split("/").filter(Boolean);
    if (segments.length === 0) return [];
    return segments.map((seg, idx) => {
      const href = "/" + segments.slice(0, idx + 1).join("/");
      return {
        label: SEGMENT_LABELS[seg] ?? humanize(seg),
        href,
        isCurrent: idx === segments.length - 1,
        isValid: VALID_PATHS.has(href),
      };
    });
  }, [pathname]);

  if (crumbs.length === 0) return null;

  return (
    <nav
      aria-label="Breadcrumb"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        minWidth: 0,
        flexShrink: 1,
        overflow: "hidden",
      }}
    >
      {/* Vertical divider separating logo from breadcrumb trail */}
      <span
        aria-hidden="true"
        style={{
          width: 1,
          height: 18,
          marginInline: 6,
          background:
            "linear-gradient(180deg, transparent, hsl(var(--gold) / 0.4), transparent)",
          flexShrink: 0,
        }}
      />
      <ol
        className="flex items-center gap-1 text-xs font-medium list-none"
        style={{
          minWidth: 0,
          overflow: "hidden",
          whiteSpace: "nowrap",
          listStyle: "none",
          margin: 0,
          padding: 0,
        }}
      >
        {crumbs.map((crumb, i) => (
          <Fragment key={crumb.href}>
            {i > 0 && (
              <li
                aria-hidden="true"
                className="text-muted-foreground/40 shrink-0"
                style={{ listStyle: "none", display: "flex" }}
              >
                <ChevronRight style={{ width: 12, height: 12 }} />
              </li>
            )}
            <li
              className="flex items-center"
              style={{
                listStyle: "none",
                minWidth: 0,
                flexShrink: crumb.isCurrent ? 1 : 0,
              }}
            >
              {crumb.isCurrent || !crumb.isValid ? (
                <span
                  aria-current={crumb.isCurrent ? "page" : undefined}
                  className={
                    crumb.isCurrent
                      ? "rounded-md px-1.5 py-0.5 text-foreground"
                      : "rounded-md px-1.5 py-0.5 text-muted-foreground"
                  }
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    minWidth: 0,
                    ...(crumb.isCurrent ? {
                      background:
                        "linear-gradient(135deg, hsl(var(--primary) / 0.14), hsl(var(--accent) / 0.14))",
                      boxShadow: "inset 0 0 0 1px hsl(var(--gold) / 0.25)",
                    } : {}),
                    letterSpacing: "0.01em",
                  }}
                  title={crumb.label}
                >
                  {crumb.label}
                </span>
              ) : (
                <Link
                  to={crumb.href}
                  className="rounded-md px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  style={{ letterSpacing: "0.01em" }}
                >
                  {crumb.label}
                </Link>
              )}
            </li>
          </Fragment>
        ))}
      </ol>
    </nav>
  );
}