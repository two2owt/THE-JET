/**
 * TabPageHeader — shared header for non-map tabs (Hot, Alerts, Saved, Crew).
 * Guarantees identical typography, gradient, and subtitle spacing across tabs.
 */
interface TabPageHeaderProps {
  title: string;
  subtitle?: string;
}

export function TabPageHeader({ title, subtitle }: TabPageHeaderProps) {
  return (
    <div>
      <h1 className="heading-luxe-gradient" style={{ marginBottom: '6px' }}>
        {title}
      </h1>
      {subtitle && (
        <p style={{ fontSize: '14px', color: 'hsl(var(--muted-foreground))' }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}