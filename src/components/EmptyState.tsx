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
    <Card className="p-fluid-xl text-center bg-card/90 backdrop-blur-sm shadow-none border-dashed">
      <div className="mx-auto w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 rounded-full bg-muted flex items-center justify-center mb-fluid-md">
        <Icon className="w-7 h-7 sm:w-8 sm:h-8 md:w-10 md:h-10 text-muted-foreground" />
      </div>
      <h3 className="text-fluid-lg sm:text-fluid-xl font-semibold text-foreground mb-fluid-xs">
        {title}
      </h3>
      <p className="text-fluid-sm text-muted-foreground mb-fluid-lg max-w-sm mx-auto">
        {description}
      </p>
      {actionLabel && onAction && (
        <Button onClick={onAction} size="lg">
          {actionLabel}
        </Button>
      )}
    </Card>
  );
};
