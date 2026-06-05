import { useLocation, useNavigate } from "react-router";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

/**
 * Default avatar artwork — the JET mark. Served from `public/` so it doesn't
 * need bundler resolution and is shared with other surfaces (JetCard, email).
 * Used for both signed-out users and signed-in users who haven't set an avatar.
 */
const DEFAULT_AVATAR_SRC = "/jet-email-logo.png";

interface HeaderUserMenuProps {
  /** Whether the parent header has finished its mount transition */
  mounted: boolean;
  avatarUrl: string | null;
  displayName: string;
  userId: string | undefined;
  email?: string;
  isAdmin?: boolean;
}

/**
 * Avatar button that navigates directly to the profile page.
 * Unauthenticated users are sent to /auth.
 * Active state is shown when on profile-related routes.
 */
export function HeaderUserMenu({
  mounted,
  avatarUrl,
  displayName,
  userId,
}: HeaderUserMenuProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const activeRoutes = ["/profile", "/admin"];
  const isOnAccountRoute = activeRoutes.some((p) => pathname.startsWith(p));

  const target = userId ? "/profile" : "/auth";
  const label = userId ? "Go to profile" : "Sign in";
  const initials = getInitials(displayName);
  // Prefer the user's uploaded avatar; otherwise fall back to the JET mark
  // so the button never renders bare initials when a brand image is available.
  const imageSrc = avatarUrl || DEFAULT_AVATAR_SRC;

  return (
    <button
      onClick={() => navigate(target)}
      aria-label={label}
      title={userId ? displayName : label}
      className="group focus:outline-none focus-visible:outline-none"
      style={triggerStyle(mounted, isOnAccountRoute)}
    >
      <Avatar className="h-full w-full" style={avatarInnerStyle}>
        <AvatarImage
          src={imageSrc}
          alt=""
          // Center the JET mark inside the circular frame with a touch of
          // breathing room. `object-contain` prevents the logo from being
          // cropped to a square edge like a photo avatar would be.
          className={avatarUrl ? "object-cover" : "object-contain p-1 bg-background"}
        />
        <AvatarFallback
          className="text-primary-foreground font-bold tracking-wide flex items-center justify-center"
          style={avatarFallbackStyle}
          delayMs={400}
        >
          <span
            aria-hidden="true"
            style={{
              lineHeight: 1,
              fontSize: "clamp(13px, 1.6vw, 15px)",
              textShadow: "0 1px 2px hsl(0 0% 0% / 0.35)",
              userSelect: "none",
            }}
          >
            {initials}
          </span>
        </AvatarFallback>
      </Avatar>
      {userId && (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            bottom: "1px",
            right: "1px",
            width: "10px",
            height: "10px",
            borderRadius: "9999px",
            background: "hsl(var(--cool, 142 76% 45%))",
            border: "2px solid hsl(var(--background))",
            boxShadow: "0 0 6px hsl(var(--cool, 142 76% 45%) / 0.6)",
          }}
        />
      )}
    </button>
  );
}

/** Derive up to 2 uppercase initials from a display name, falling back to "JA". */
function getInitials(name: string): string {
  const cleaned = (name || "").trim();
  if (!cleaned) return "JA";
  const parts = cleaned.split(/\s+/).filter(Boolean);
  const letters =
    parts.length === 1
      ? parts[0].slice(0, 2)
      : parts[0][0] + parts[parts.length - 1][0];
  return letters.toUpperCase();
}

/** Avatar trigger button styling (gradient ring, mount transition, active glow). */
function triggerStyle(mounted: boolean, isActive: boolean): React.CSSProperties {
  return {
    position: "relative",
    flexShrink: 0,
    borderRadius: "9999px",
    width: "clamp(38px, 5vw, 44px)",
    height: "clamp(38px, 5vw, 44px)",
    padding: "2.5px",
    overflow: "hidden",
    boxSizing: "border-box",
    background:
      "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--accent)) 50%, hsl(var(--primary-glow, var(--primary))) 100%)",
    cursor: "pointer",
    border: "none",
    opacity: mounted ? 1 : 0,
    transform: mounted
      ? "translateX(0) scale(1)"
      : "translateX(8px) scale(0.9)",
    transition:
      "opacity 0.4s ease-out 0.2s, transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s, box-shadow 0.3s ease",
    boxShadow: isActive
      ? "0 0 0 2px hsl(var(--primary) / 0.55), 0 4px 18px hsl(var(--primary) / 0.4), 0 0 0 1px hsl(var(--background) / 0.8)"
      : "0 2px 12px hsl(var(--primary) / 0.25), 0 0 0 1px hsl(var(--background) / 0.6)",
  };
}

const avatarInnerStyle: React.CSSProperties = {
  border: "2px solid hsl(var(--background))",
  background: "hsl(var(--background))",
  boxSizing: "border-box",
  overflow: "hidden",
  borderRadius: "9999px",
};

const avatarFallbackStyle: React.CSSProperties = {
  fontSize: "clamp(11px, 1.5vw, 14px)",
  background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)))",
  letterSpacing: "0.02em",
};
