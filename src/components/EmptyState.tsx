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
        backgroundColor: 'hsl(var(--card) / 0.9)',
        border: '1px solid hsl(var(--primary) / 0.15)',
        backdropFilter: 'blur(12px)',
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
          background: 'linear-gradient(135deg, hsl(var(--primary) / 0.15), hsl(var(--accent) / 0.15))',
          border: '1px solid hsl(var(--primary) / 0.2)',
        }}
      >
        <Icon style={{ width: '28px', height: '28px', color: 'hsl(var(--primary))' }} />
      </div>
      <h3
        style={{
          fontSize: '18px',
          fontWeight: 700,
          color: 'hsl(var(--foreground))',
          marginBottom: '6px',
        }}
      >
        {title}
      </h3>
      <p
        style={{
          fontSize: '14px',
          color: 'hsl(var(--muted-foreground))',
          marginBottom: actionLabel ? '20px' : '0',
          maxWidth: '320px',
          marginLeft: 'auto',
          marginRight: 'auto',
          lineHeight: 1.5,
        }}
      >
        {description}
      </p>
      {actionLabel && onAction && (
        <Button onClick={onAction} size="lg" className="bg-gradient-to-r from-primary to-primary-glow hover:opacity-90 text-primary-foreground font-semibold rounded-xl">
          {actionLabel}
        </Button>
      )}
    </div>
  );
};
