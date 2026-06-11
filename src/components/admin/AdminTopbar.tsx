import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import {
  Bell, LogOut, Search, Settings, User as UserIcon, X,
  LayoutGrid, Tag, Store, MapPinned, Loader2,
} from "lucide-react";
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

/** Live entity search result drawn from the database. */
type EntityKind = "section" | "deal" | "venue" | "neighborhood";
interface EntityResult {
  kind: EntityKind;
  id: string;
  label: string;
  description?: string;
  /** Optional href; when present, selection navigates there. */
  href?: string;
  /** Optional admin section id to activate on select. */
  sectionId?: string;
}

const KIND_META: Record<EntityKind, { label: string; icon: typeof Tag }> = {
  section:      { label: "Admin sections", icon: LayoutGrid },
  deal:         { label: "Deals",          icon: Tag },
  venue:        { label: "Venues / JetCards", icon: Store },
  neighborhood: { label: "Neighborhoods",  icon: MapPinned },
};

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

  /* ---------------- Live entity search (deals / venues / neighborhoods) ---- */
  const [entityResults, setEntityResults] = useState<EntityResult[]>([]);
  const [entitySearching, setEntitySearching] = useState(false);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setEntityResults([]);
      setEntitySearching(false);
      return;
    }
    let cancelled = false;
    setEntitySearching(true);
    const handle = window.setTimeout(async () => {
      try {
        const like = `%${term.replace(/[%_]/g, (m) => `\\${m}`)}%`;
        const [dealsRes, neighRes] = await Promise.all([
          supabase
            .from("deals")
            .select("id, title, venue_id, venue_name, venue_address, active")
            .or(`title.ilike.${like},venue_name.ilike.${like}`)
            .limit(8),
          supabase
            .from("neighborhoods")
            .select("id, name, slug, description, active")
            .ilike("name", like)
            .limit(5),
        ]);
        if (cancelled) return;

        const next: EntityResult[] = [];

        // Venues — derived from distinct deal venue_ids
        const venuesSeen = new Set<string>();
        (dealsRes.data ?? []).forEach((d) => {
          if (d.venue_id && !venuesSeen.has(d.venue_id)) {
            venuesSeen.add(d.venue_id);
            next.push({
              kind: "venue",
              id: d.venue_id,
              label: d.venue_name ?? "Untitled venue",
              description: d.venue_address ?? "Open JetCard on map",
              href: `/?venue=${encodeURIComponent(d.venue_id)}`,
            });
          }
        });

        // Deals
        (dealsRes.data ?? []).slice(0, 6).forEach((d) => {
          next.push({
            kind: "deal",
            id: d.id,
            label: d.title,
            description: d.venue_name
              ? `${d.venue_name}${d.active ? "" : " · inactive"}`
              : (d.active ? "Active deal" : "Inactive deal"),
            href: `/?deal=${encodeURIComponent(d.id)}`,
          });
        });

        // Neighborhoods → jump to admin Areas section
        (neighRes.data ?? []).forEach((n) => {
          next.push({
            kind: "neighborhood",
            id: n.id,
            label: n.name,
            description: n.description ?? (n.active ? "Active geofence" : "Inactive geofence"),
            sectionId: "areas",
          });
        });

        setEntityResults(next);
      } catch {
        if (!cancelled) setEntityResults([]);
      } finally {
        if (!cancelled) setEntitySearching(false);
      }
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [q]);

  /** Grouped, ordered list of results for rendering. */
  const grouped = useMemo(() => {
    const sectionResults: EntityResult[] = results.map((s) => ({
      kind: "section",
      id: s.id,
      label: s.label,
      description: s.description,
      sectionId: s.id,
    }));
    const byKind: Record<EntityKind, EntityResult[]> = {
      section: sectionResults,
      venue: entityResults.filter((r) => r.kind === "venue"),
      deal: entityResults.filter((r) => r.kind === "deal"),
      neighborhood: entityResults.filter((r) => r.kind === "neighborhood"),
    };
    return (["section", "venue", "deal", "neighborhood"] as EntityKind[])
      .map((k) => ({ kind: k, items: byKind[k] }))
      .filter((g) => g.items.length > 0);
  }, [results, entityResults]);

  const totalCount = grouped.reduce((sum, g) => sum + g.items.length, 0);

  function handlePickResult(r: EntityResult) {
    setSearchOpen(false);
    if (r.href) {
      navigate(r.href);
      return;
    }
    if (r.sectionId) {
      onSelect(r.sectionId);
    }
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
                placeholder="Search sections, deals, venues, neighborhoods…"
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
            <div className="admin-search-results" role="listbox" aria-label="Search results">
              {totalCount === 0 ? (
                <p className="admin-search-empty">
                  {entitySearching
                    ? "Searching…"
                    : q.trim().length < 2
                      ? "Type 2+ characters to search deals, venues, neighborhoods."
                      : `No matches for “${q}”.`}
                </p>
              ) : (
                grouped.map((group) => {
                  const meta = KIND_META[group.kind];
                  const Icon = meta.icon;
                  return (
                    <section key={group.kind} className="admin-search-group" role="group" aria-label={meta.label}>
                      <header className="admin-search-group-label">
                        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{meta.label}</span>
                      </header>
                      <ul className="admin-search-group-list">
                        {group.items.map((r) => (
                          <li key={`${r.kind}-${r.id}`}>
                            <button
                              type="button"
                              className="admin-search-result"
                              onClick={() => handlePickResult(r)}
                              role="option"
                              aria-selected="false"
                            >
                              <span className="admin-search-result-label">{r.label}</span>
                              {r.description && (
                                <span className="admin-search-result-desc">{r.description}</span>
                              )}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </section>
                  );
                })
              )}
              {entitySearching && totalCount > 0 && (
                <div className="admin-search-searching" aria-live="polite">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  <span>Updating results…</span>
                </div>
              )}
            </div>
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