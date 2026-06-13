import { useNavigate } from "react-router";
import { Heart, Users, Bell, type LucideIcon } from "lucide-react";

interface StatPill {
  icon: LucideIcon;
  label: string;
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
 */
export function ProfileStatsPills({
  favoritesCount,
  connectionsCount,
  unreadAlertsCount,
}: ProfileStatsPillsProps) {
  const navigate = useNavigate();
  const pills: StatPill[] = [
    { icon: Heart, label: "Favorites", value: favoritesCount, to: "/favorites" },
    { icon: Users, label: "Connections", value: connectionsCount, to: "/social" },
    { icon: Bell, label: "Alerts", value: unreadAlertsCount, to: "/?tab=notifications" },
  ];

  return (
    <div className="profile-stat-pill-row" role="list">
      {pills.map(({ icon: Icon, label, value, to }) => (
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
          <span className="profile-stat-pill-value">{value}</span>
          <span className="profile-stat-pill-label">{label}</span>
        </button>
      ))}
    </div>
  );
}

export default ProfileStatsPills;