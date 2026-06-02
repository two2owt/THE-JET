import { useLocation, useNavigate } from "react-router";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import jetPaperPlaneAsset from "@/assets/jet-paper-plane.png.asset.json";

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

  const activeRoutes = ["/profile", "/settings", "/admin"];
  const isOnAccountRoute = activeRoutes.some((p) => pathname.startsWith(p));

  const target = userId ? "/profile" : "/auth";
  const label = userId ? "Go to profile" : "Sign in";

  return (
    <button
      onClick={() => navigate(target)}
      aria-label={label}
      title={userId ? displayName : label}
      className="group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      style={triggerStyle(mounted, isOnAccountRoute)}
    >
      <Avatar className="h-full w-full" style={avatarInnerStyle}>
        <AvatarImage src={avatarUrl || ""} alt="" />
        <AvatarFallback
          className="text-primary-foreground font-bold tracking-wide"
          style={avatarFallbackStyle}
          delayMs={avatarUrl ? 400 : 0}
        >
          <PaperPlaneFallback />
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

/**
 * Default avatar shown until a user uploads their own image.
 * Uses the JET paper-plane logo centered on the gradient ring background.
 */
function PaperPlaneFallback() {
  return (
    <img
      src={jetPaperPlaneAsset.url}
      alt=""
      aria-hidden="true"
      draggable={false}
      decoding="async"
      loading="lazy"
      style={{
        width: "70%",
        height: "70%",
        objectFit: "contain",
        objectPosition: "center",
        // Optical centering — the plane's visual mass sits slightly lower-left
        transform: "translate(2%, -2%)",
        filter: "drop-shadow(0 1px 3px hsl(0 0% 0% / 0.45))",
        pointerEvents: "none",
        userSelect: "none",
      }}
    />
  );
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
};

const avatarFallbackStyle: React.CSSProperties = {
  fontSize: "clamp(11px, 1.5vw, 14px)",
  background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)))",
  letterSpacing: "0.02em",
};
