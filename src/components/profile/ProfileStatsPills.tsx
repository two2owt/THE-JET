import { useNavigate } from "@/lib/router-compat";
import { Heart, Users, Bell, type LucideIcon } from "lucide-react";

interface StatPill {
  icon: LucideIcon;
  label: string;
  shortLabel: string;
  value: number;
  to: string;
}

interface ProfileStatsPillsProps {
  favoritesCount: number;
  connectionsCount: number;
  unreadAlertsCount: number;
}

/**
 * Modern horizontal pill row replacing the boxy 3-column stats grid.
 * Each pill: rounded icon chip + bold value + label, clickable to deep-link.
 * Labels adapt by breakpoint (short on very narrow screens, full otherwise).
 */
export function ProfileStatsPills({
  favoritesCount,
  connectionsCount,
  unreadAlertsCount,
}: ProfileStatsPillsProps) {
  const navigate = useNavigate();
  const pills: StatPill[] = [
    {
      icon: Heart,
      label: "Favorites",
      shortLabel: "Saved",
      value: favoritesCount,
      to: "/favorites",
    },
    {
      icon: Users,
      label: "Connections",
      shortLabel: "Social",
      value: connectionsCount,
      to: "/social",
    },
    {
      icon: Bell,
      label: "Alerts",
      shortLabel: "Alerts",
      value: unreadAlertsCount,
      to: "/alerts",
    },
  ];

  return (
    <div className="profile-stat-pill-row" role="list">
      {pills.map(({ icon: Icon, label, shortLabel, value, to }) => (
        <button
          key={label}
          type="button"
          role="listitem"
          onClick={() => navigate(to)}
          className="profile-stat-pill"
          aria-label={`${value} ${label}`}
        >
          <span className="profile-stat-pill-icon" aria-hidden="true">
            <Icon className="w-3.5 h-3.5" />
          </span>
          <span className="profile-stat-pill-text">
            <span className="profile-stat-pill-value">{value}</span>
            <span className="profile-stat-pill-label" aria-hidden="true">
              <span className="profile-stat-pill-label-full">{label}</span>
              <span className="profile-stat-pill-label-short">{shortLabel}</span>
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

export default ProfileStatsPills;
