import { LucideIcon } from "lucide-react";
import { Button } from "./ui/button";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState = ({ 
  icon: Icon, 
  title, 
  description, 
  actionLabel, 
  onAction 
}: EmptyStateProps) => {
  return (
    <div
      style={{
        padding: '40px 24px',
        textAlign: 'center',
        borderRadius: '16px',
        // Dark luxe surface — hairline border + ambient gold glow + soft vertical gradient
        background:
          'linear-gradient(180deg, hsl(var(--card) / 0.92), hsl(var(--card) / 0.78))',
        border: '1px solid hsl(0 0% 100% / 0.05)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        boxShadow:
          '0 0 60px hsl(var(--gold) / 0.05), 0 20px 50px -20px hsl(0 0% 0% / 0.65), inset 0 1px 0 hsl(0 0% 100% / 0.04)',
      }}
    >
      <div
        style={{
          width: '64px',
          height: '64px',
          margin: '0 auto 16px',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          // Halo: brand gradient core, gold hairline ring, soft gold glow
          background:
            'linear-gradient(135deg, hsl(var(--primary) / 0.18), hsl(var(--accent) / 0.18))',
          border: '1px solid hsl(var(--gold) / 0.25)',
          boxShadow:
            '0 0 22px hsl(var(--gold) / 0.12), inset 0 0 0 1px hsl(0 0% 100% / 0.04)',
        }}
      >
        <Icon style={{ width: '28px', height: '28px', color: 'hsl(var(--primary))' }} />
      </div>
      <h3 className="heading-luxe-section" style={{ marginBottom: '8px' }}>
        {title}
      </h3>
      <p
        className="body-luxe-muted"
        style={{
          marginBottom: actionLabel ? '20px' : '0',
          maxWidth: '320px',
          marginLeft: 'auto',
          marginRight: 'auto',
        }}
      >
        {description}
      </p>
      {actionLabel && onAction && (
        <Button
          onClick={onAction}
          size="lg"
          className="w-full sm:w-auto"
          style={{
            background: 'linear-gradient(to right, hsl(var(--primary)), hsl(var(--primary-glow)))',
            color: 'hsl(var(--primary-foreground))',
            fontWeight: 600,
            fontSize: '15px',
            borderRadius: '12px',
            border: 'none',
            height: '48px',
            maxWidth: '320px',
            paddingLeft: '28px',
            paddingRight: '28px',
            boxShadow: '0 8px 24px -8px hsl(var(--primary) / 0.5)',
            transition: 'transform 0.15s ease, box-shadow 0.15s ease',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-1px)';
            e.currentTarget.style.boxShadow = '0 12px 28px -8px hsl(var(--primary) / 0.6)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 8px 24px -8px hsl(var(--primary) / 0.5)';
          }}
        >
          {actionLabel}
        </Button>
      )}
    </div>
  );
};
