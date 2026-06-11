import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Bell, LogOut, Search, Settings, User as UserIcon, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useProfile } from "@/hooks/useProfile";
import { useNotifications } from "@/hooks/useNotifications";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

const DEFAULT_AVATAR = "/jet-email-logo.png";

interface SearchItem {
  id: string;
  label: string;
  description?: string;
}

interface AdminTopbarProps {
  /** Searchable items (admin sections). */
  items: SearchItem[];
  /** Called when the user picks a result. */
  onSelect: (id: string) => void;
}

/**
 * Admin Topbar — expandable blurred search, notifications badge,
 * and animated user dropdown. UI-only; relies on existing hooks.
 */
export function AdminTopbar({ items, onSelect }: AdminTopbarProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile } = useProfile(user?.id);
  const { notifications } = useNotifications(!!user);

  const unread = notifications.filter((n) => !n.read).length;
  const displayName =
    profile?.display_name ||
    (user?.email ? user.email.split("@")[0] : "Admin");
  const initials = getInitials(displayName);
  const avatarUrl = profile?.avatar_url || DEFAULT_AVATAR;

  /* ---------------- Search expansion ---------------- */
  const [searchOpen, setSearchOpen] = useState(false);
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (searchOpen) {
      const id = window.setTimeout(() => inputRef.current?.focus(), 50);
      return () => window.clearTimeout(id);
    }
    setQ("");
  }, [searchOpen]);

  // Esc to close
  useEffect(() => {
    if (!searchOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSearchOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searchOpen]);

  // "/" to open search (ignore when typing in inputs)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || searchOpen) return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || t?.isContentEditable) return;
      e.preventDefault();
      setSearchOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searchOpen]);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return items;
    return items.filter(
      (i) =>
        i.label.toLowerCase().includes(term) ||
        (i.description?.toLowerCase().includes(term) ?? false),
    );
  }, [q, items]);

  function handlePick(id: string) {
    onSelect(id);
    setSearchOpen(false);
  }

  async function handleSignOut() {
    try {
      await supabase.auth.signOut();
    } finally {
      navigate("/auth", { replace: true });
    }
  }

  return (
    <div className="admin-topbar" role="region" aria-label="Admin toolbar">
      {/* Collapsed search trigger */}
      <button
        type="button"
        className="admin-topbar-search-trigger"
        onClick={() => setSearchOpen(true)}
        aria-label="Search admin"
        aria-expanded={searchOpen}
      >
        <Search className="h-4 w-4" />
        <span className="admin-topbar-search-trigger-label">Search admin…</span>
        <kbd className="admin-topbar-kbd" aria-hidden="true">/</kbd>
      </button>

      <div className="admin-topbar-spacer" />

      {/* Notifications */}
      <button
        type="button"
        className="admin-topbar-icon-btn"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
        onClick={() => navigate("/?tab=alerts")}
      >
        <Bell className="h-[18px] w-[18px]" />
        {unread > 0 && (
          <span className="admin-topbar-badge" aria-hidden="true">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {/* User dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="admin-topbar-user"
            aria-label="Open user menu"
          >
            <Avatar className="h-9 w-9">
              <AvatarImage
                src={avatarUrl}
                alt=""
                className={profile?.avatar_url ? "object-cover" : "object-contain p-1 bg-background"}
              />
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <span className="admin-topbar-user-name">{displayName}</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={8}
          alignOffset={-4}
          collisionPadding={12}
          className="admin-topbar-menu w-56"
        >
          <DropdownMenuLabel className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold text-foreground">{displayName}</span>
            {user?.email && (
              <span className="text-xs font-normal text-muted-foreground truncate">
                {user.email}
              </span>
            )}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => navigate("/profile")}>
            <UserIcon aria-hidden="true" /> Profile
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => navigate("/profile?section=settings")}>
            <Settings aria-hidden="true" /> Settings
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={handleSignOut}>
            <LogOut aria-hidden="true" /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Expanded search overlay */}
      {searchOpen && (
        <div className="admin-search-overlay" role="dialog" aria-modal="true" aria-label="Search">
          <button
            type="button"
            aria-label="Close search"
            className="admin-search-backdrop"
            onClick={() => setSearchOpen(false)}
          />
          <div className="admin-search-panel">
            <div className="admin-search-inputrow">
              <Search className="h-5 w-5 text-muted-foreground" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search sections, deals, users…"
                className="admin-search-input"
                aria-label="Search admin"
              />
              <button
                type="button"
                onClick={() => setSearchOpen(false)}
                className="admin-search-close"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <ul className="admin-search-results" role="listbox">
              {results.length === 0 ? (
                <li className="admin-search-empty">No matches for “{q}”.</li>
              ) : (
                results.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      className="admin-search-result"
                      onClick={() => handlePick(r.id)}
                      role="option"
                    >
                      <span className="admin-search-result-label">{r.label}</span>
                      {r.description && (
                        <span className="admin-search-result-desc">{r.description}</span>
                      )}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "JA";
  const letters = parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[parts.length - 1][0];
  return letters.toUpperCase();
}