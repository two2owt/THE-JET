import { Fragment, useMemo } from "react";
import { Link, useLocation } from "react-router";
import { Home, ChevronRight } from "lucide-react";

/**
 * SaaS-style breadcrumbs derived from the current pathname.
 *
 * Renders nothing on:
 *  - The map root (`/`) — already the implicit root, no breadcrumb needed
 *  - Headerless / full-bleed routes (`/auth`, `/onboarding`)
 *
 * Supports nested navigation by splitting the path on `/` and mapping each
 * segment to a friendly label. Unknown segments fall back to a humanized
 * version of the slug (e.g. `verification-success` → "Verification success").
 */

/** Friendly labels for known path segments. Keep in sync with src/App.tsx routes. */
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

/** Routes where breadcrumbs should never render. */
const HIDDEN_ROUTES = new Set(["/", "/auth", "/onboarding"]);

/** Paths that map to real routes in App.tsx. Intermediate crumbs whose
 *  href is not in this set render as non-clickable text instead of links
 *  (prevents users landing on NotFound via fabricated paths like
 *  /profile/settings/social or /admin/dev). */
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
}

export function Breadcrumbs() {
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
      className="fixed left-0 right-0 z-[55] pointer-events-none md:hidden"
      style={{
        top: "var(--header-total-height, 52px)",
      }}
    >
      <div
        className="pointer-events-auto"
        style={{
          background: "hsl(var(--background) / 0.72)",
          backdropFilter: "blur(14px) saturate(1.4)",
          WebkitBackdropFilter: "blur(14px) saturate(1.4)",
          borderBottom: "1px solid hsl(var(--border) / 0.4)",
        }}
      >
        <ol
          className="flex items-center gap-1.5 text-xs font-medium list-none"
          style={{
            maxWidth: "1280px",
            margin: "0 auto",
            padding: "8px clamp(12px, 2vw, 32px)",
            minHeight: "var(--breadcrumb-height, 36px)",
            overflowX: "auto",
            scrollbarWidth: "none",
            whiteSpace: "nowrap",
            listStyle: "none",
          }}
        >
          <li className="flex items-center shrink-0" style={{ listStyle: "none" }}>
            <Link
              to="/"
              aria-label="Home"
              className="flex items-center gap-1 rounded-md px-1.5 py-1 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Home aria-hidden="true" style={{ width: 14, height: 14, flexShrink: 0 }} />
            </Link>
          </li>
          {crumbs.map((crumb) => (
            <Fragment key={crumb.href}>
              <li aria-hidden="true" className="text-muted-foreground/50 shrink-0" style={{ listStyle: "none" }}>
                <ChevronRight style={{ width: 12, height: 12, flexShrink: 0 }} />
              </li>
              <li className="flex items-center shrink-0" style={{ listStyle: "none" }}>
                {crumb.isCurrent || !crumb.isValid ? (
                  <span
                    aria-current={crumb.isCurrent ? "page" : undefined}
                    className={
                      crumb.isCurrent
                        ? "rounded-md px-1.5 py-1 text-foreground"
                        : "rounded-md px-1.5 py-1 text-muted-foreground"
                    }
                    style={{
                      ...(crumb.isCurrent ? {
                      background:
                        "linear-gradient(135deg, hsl(var(--primary) / 0.12), hsl(var(--accent) / 0.12))",
                      boxShadow: "inset 0 0 0 1px hsl(var(--primary) / 0.18)",
                      } : {}),
                    }}
                  >
                    {crumb.label}
                  </span>
                ) : (
                  <Link
                    to={crumb.href}
                    className="rounded-md px-1.5 py-1 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    {crumb.label}
                  </Link>
                )}
              </li>
            </Fragment>
          ))}
        </ol>
      </div>
    </nav>
  );
}