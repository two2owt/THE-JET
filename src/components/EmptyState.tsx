import { LucideIcon } from "lucide-react";
import { Button } from "./ui/button";
import { Card } from "./ui/card";

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
    <Card className="p-fluid-xl text-center bg-card/90 backdrop-blur-xl shadow-card border border-primary/15 ring-1 ring-primary/10">
      <div className="mx-auto w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 rounded-full bg-gradient-to-br from-primary/15 to-accent/15 flex items-center justify-center mb-fluid-md ring-1 ring-primary/20">
        <Icon className="w-7 h-7 sm:w-8 sm:h-8 md:w-10 md:h-10 text-primary" />
      </div>
      <h3 className="text-fluid-lg sm:text-fluid-xl font-bold text-foreground mb-fluid-xs">
        {title}
      </h3>
      <p className="text-fluid-sm text-muted-foreground mb-fluid-lg max-w-sm mx-auto">
        {description}
      </p>
      {actionLabel && onAction && (
        <Button onClick={onAction} size="lg" variant="jet">
          {actionLabel}
        </Button>
      )}
    </Card>
  );
};
