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
import { LuxeAvatar } from "@/components/ui/luxe-avatar";
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
        className="group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-full"
        style={wrapperStyle(mounted)}
      >
        <LuxeAvatar
          forceIconFallback
          alt="Sign in"
          className="w-[clamp(38px,5vw,44px)] h-[clamp(38px,5vw,44px)]"
        />
      </button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Open user menu"
          title={displayName}
          className="group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-full"
          style={wrapperStyle(mounted)}
        >
          <LuxeAvatar
            src={avatarUrl}
            alt={displayName}
            initials={displayName.substring(0, 2)}
            forceIconFallback={!avatarUrl}
            showPresence
            active={isOnAccountRoute}
            className="w-[clamp(38px,5vw,44px)] h-[clamp(38px,5vw,44px)]"
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

/** Mount animation wrapper for the avatar trigger button. */
function wrapperStyle(mounted: boolean): React.CSSProperties {
  return {
    flexShrink: 0,
    background: "transparent",
    border: "none",
    padding: 0,
    opacity: mounted ? 1 : 0,
    transform: mounted ? "translateX(0) scale(1)" : "translateX(8px) scale(0.9)",
    transition:
      "opacity 0.4s ease-out 0.2s, transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s",
  };
}
