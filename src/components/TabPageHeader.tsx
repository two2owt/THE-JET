/**
 * TabPageHeader — shared header for non-map tabs (Hot, Alerts, Saved, Crew).
 * Guarantees identical typography, gradient, and subtitle spacing across tabs.
 */
interface TabPageHeaderProps {
  title: string;
  subtitle?: string;
  /** Optional trailing element rendered inline with the title (e.g. unread badge) */
  badge?: React.ReactNode;
}

export function TabPageHeader({ title, subtitle, badge }: TabPageHeaderProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "12px",
        flexWrap: "wrap",
      }}
    >
      <div>
        <h2 className="heading-luxe-gradient" style={{ marginBottom: "6px" }}>
          {title}
        </h2>
        {subtitle && (
          <p
            style={{ fontSize: "14px", color: "hsl(var(--muted-foreground))" }}
          >
            {subtitle}
          </p>
        )}
      </div>
      {badge}
    </div>
  );
}
