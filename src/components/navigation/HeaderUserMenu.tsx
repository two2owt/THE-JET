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
            ?
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
          <Avatar className="h-full w-full avatar-inner" style={avatarInnerStyle}>
            <AvatarImage src={avatarUrl || ""} alt="" />
            <AvatarFallback
              className="text-primary-foreground font-bold tracking-wide"
              style={avatarFallbackStyle}
            >
              {displayName.substring(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              bottom: "0px",
              right: "0px",
              width: "14px",
              height: "14px",
              borderRadius: "9999px",
              background: "hsl(var(--background))",
              display: "grid",
              placeItems: "center",
            }}
          >
            <span
              style={{
                position: "relative",
                width: "9px",
                height: "9px",
                borderRadius: "9999px",
                background: "#10B981",
                boxShadow: "0 0 8px rgba(16,185,129,0.8)",
                border: "0.5px solid hsl(var(--background) / 0.3)",
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: "9999px",
                  background: "#10B981",
                  opacity: 0.3,
                  animation: "ping 1.6s cubic-bezier(0,0,0.2,1) infinite",
                }}
              />
            </span>
          </span>
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

/** Avatar trigger button styling — Luxe Gradient Avatar (red → purple → gold). */
function triggerStyle(mounted: boolean, isActive: boolean): React.CSSProperties {
  return {
    position: "relative",
    flexShrink: 0,
    borderRadius: "9999px",
    width: "clamp(38px, 5vw, 44px)",
    height: "clamp(38px, 5vw, 44px)",
    padding: "2px",
    // Brand gradient: JET red → purple → gold luxe accent
    background:
      "linear-gradient(135deg, #FF2D55 0%, #8E2DE2 55%, #C9A961 100%)",
    cursor: "pointer",
    border: "none",
    opacity: mounted ? 1 : 0,
    transform: mounted
      ? "translateX(0) scale(1)"
      : "translateX(8px) scale(0.9)",
    transition:
      "opacity 0.4s ease-out 0.2s, transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s, box-shadow 0.4s ease",
    boxShadow: isActive
      ? "0 0 0 1px hsl(var(--background)), 0 0 22px rgba(142,45,226,0.55), 0 4px 18px rgba(255,45,85,0.35)"
      : "0 0 0 1px hsl(var(--background) / 0.7), 0 4px 14px rgba(0,0,0,0.5)",
  };
}

const avatarInnerStyle: React.CSSProperties = {
  // Inner dark gap + silver inset rim for depth (luxe layered look)
  background: "#1A1A1A",
  boxShadow:
    "inset 0 0 0 1.5px #0A0A0A, inset 0 0 0 2.5px rgba(156,163,175,0.22)",
  transition: "box-shadow 0.4s ease",
};

const avatarFallbackStyle: React.CSSProperties = {
  fontSize: "clamp(11px, 1.5vw, 14px)",
  background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)))",
  letterSpacing: "0.02em",
};
