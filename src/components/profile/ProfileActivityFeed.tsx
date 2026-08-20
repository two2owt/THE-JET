import { useMemo } from "react";
import { useNavigate } from "@/lib/router-compat";
import { Bell, Heart, Users, type LucideIcon } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { Activity as ActivityIcon } from "lucide-react";

interface ActivityItem {
  id: string;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  at: number;
  to: string;
}

interface ProfileActivityFeedProps {
  favorites: Array<{
    id: string;
    venue_name?: string | null;
    created_at: string;
    venue_id?: string | null;
    deal_id?: string | null;
  }>;
  connections: Array<{
    id: string;
    created_at: string;
    profile?: { display_name: string | null } | null;
  }>;
  notifications: Array<{
    id: string;
    title: string;
    message: string;
    sentAt?: string;
    read?: boolean;
  }>;
  limit?: number;
}

function relative(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.round(diff / 60000);
  if (!Number.isFinite(mins) || mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

/**
 * Real recent-activity feed for the profile Activity tab: merges the user's
 * favorites, new connections and delivered alerts into one time-ordered list.
 */
export function ProfileActivityFeed({
  favorites,
  connections,
  notifications,
  limit = 8,
}: ProfileActivityFeedProps) {
  const navigate = useNavigate();

  const items = useMemo<ActivityItem[]>(() => {
    const merged: ActivityItem[] = [
      ...favorites.map((f) => ({
        id: `fav-${f.id}`,
        icon: Heart,
        title: f.venue_name || "Saved a deal",
        subtitle: "Added to favorites",
        at: new Date(f.created_at).getTime(),
        to: f.venue_id ? `/?venue=${f.venue_id}` : "/favorites",
      })),
      ...connections.map((c) => ({
        id: `con-${c.id}`,
        icon: Users,
        title: c.profile?.display_name || "New connection",
        subtitle: "Connected on JET",
        at: new Date(c.created_at).getTime(),
        to: "/social",
      })),
      ...notifications.map((n) => ({
        id: `not-${n.id}`,
        icon: Bell,
        title: n.title,
        subtitle: n.message,
        at: n.sentAt ? new Date(n.sentAt).getTime() : 0,
        to: "/?tab=notifications",
      })),
    ];
    return merged
      .filter((i) => Number.isFinite(i.at))
      .sort((a, b) => b.at - a.at)
      .slice(0, limit);
  }, [favorites, connections, notifications, limit]);

  if (items.length === 0) {
    return (
      <EmptyState
        icon={ActivityIcon}
        title="No activity yet"
        description="When you save deals, connect with people, or get alerts, you'll see them here."
        actionLabel="Explore the map"
        onAction={() => navigate("/")}
      />
    );
  }

  return (
    <ul className="flex flex-col" style={{ gap: "var(--space-sm)" }}>
      {items.map(({ id, icon: Icon, title, subtitle, at, to }) => (
        <li key={id}>
          <button
            type="button"
            onClick={() => navigate(to)}
            className="w-full text-left rounded-2xl border-hairline bg-card/40 hover:bg-card/60 hover:border-primary/40 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/50 transition-colors flex items-center gap-3 p-3 min-h-[56px]"
          >
            <span className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full bg-primary/15 text-primary">
              <Icon className="w-4 h-4" aria-hidden="true" />
            </span>
            <span className="flex flex-col min-w-0 flex-1">
              <span className="text-fluid-sm font-semibold text-foreground truncate">
                {title}
              </span>
              <span className="text-xs text-muted-foreground truncate">
                {subtitle}
              </span>
            </span>
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {relative(at)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export default ProfileActivityFeed;