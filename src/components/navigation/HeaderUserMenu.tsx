import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import {
  User as UserIcon,
  Settings as SettingsIcon,
  LogOut,
  ShieldCheck,
  Check,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import jetPaperPlaneAsset from "@/assets/jet-paper-plane.png.asset.json";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
 * Avatar trigger + dropdown menu with profile, settings, admin (when
 * applicable), and sign-out actions. Active route is indicated with a
 * trailing checkmark and a ring around the avatar.
 */
export function HeaderUserMenu({
  mounted,
  avatarUrl,
  displayName,
  userId,
  email,
  isAdmin = false,
}: HeaderUserMenuProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [signingOut, setSigningOut] = useState(false);

  // The avatar is "active" when the user is on a profile-y route
  const activeRoutes = ["/profile", "/settings", "/admin"];
  const isOnAccountRoute = activeRoutes.some((p) => pathname.startsWith(p));

  // If unauthenticated, the trigger goes straight to /auth instead of
  // opening a menu — there's nothing to show.
  if (!userId) {
    return (
      <button
        onClick={() => navigate("/auth")}
        aria-label="Sign in"
        className="group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        style={triggerStyle(mounted, false)}
      >
        <Avatar className="h-full w-full" style={avatarInnerStyle}>
          <AvatarFallback
            className="text-primary-foreground font-bold tracking-wide"
            style={avatarFallbackStyle}
          >
            <PaperPlaneFallback />
          </AvatarFallback>
        </Avatar>
      </button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Open user menu"
          title={displayName}
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
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-60 z-[70]"
      >
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="truncate text-sm font-semibold text-foreground">
              {displayName}
            </span>
            {email && (
              <span className="truncate text-xs font-normal text-muted-foreground">
                {email}
              </span>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <MenuLink
          to="/profile"
          icon={UserIcon}
          label="Profile"
          active={pathname.startsWith("/profile")}
          onSelect={() => navigate("/profile")}
        />
        <MenuLink
          to="/settings"
          icon={SettingsIcon}
          label="Settings"
          active={pathname.startsWith("/settings")}
          onSelect={() => navigate("/settings")}
        />
        {isAdmin && (
          <MenuLink
            to="/admin"
            icon={ShieldCheck}
            label="Admin"
            active={pathname.startsWith("/admin")}
            onSelect={() => navigate("/admin")}
          />
        )}

        <DropdownMenuSeparator />

        <DropdownMenuItem
          disabled={signingOut}
          onSelect={async (e) => {
            e.preventDefault();
            setSigningOut(true);
            try {
              await supabase.auth.signOut();
              navigate("/auth", { replace: true });
            } finally {
              setSigningOut(false);
            }
          }}
          className="text-destructive focus:text-destructive"
        >
          <LogOut className="mr-2 h-4 w-4" />
          {signingOut ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
      style={{
        width: "62%",
        height: "62%",
        objectFit: "contain",
        objectPosition: "center",
        // Slight optical centering — the plane's mass sits lower-left
        transform: "translate(1%, 2%)",
        filter: "drop-shadow(0 1px 2px hsl(var(--background) / 0.4))",
        pointerEvents: "none",
        userSelect: "none",
      }}
    />
  );
}

/** Single dropdown row with active-state checkmark. */
function MenuLink({
  icon: Icon,
  label,
  active,
  onSelect,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <DropdownMenuItem
      onSelect={(e) => {
        e.preventDefault();
        onSelect();
      }}
      aria-current={active ? "page" : undefined}
      className={active ? "bg-accent/40" : undefined}
    >
      <Icon className="mr-2 h-4 w-4" />
      <span className="flex-1">{label}</span>
      {active && <Check className="ml-2 h-3.5 w-3.5 text-primary" />}
    </DropdownMenuItem>
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
