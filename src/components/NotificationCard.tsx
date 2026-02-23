import { memo } from "react";
import { MapPin, Clock, Gift, TrendingUp } from "lucide-react";

export interface Notification {
  id: string;
  type: "offer" | "event" | "trending";
  title: string;
  message: string;
  venue?: string;
  timestamp: string;
  distance?: string;
  read?: boolean;
}

interface NotificationCardProps {
  notification: Notification;
  onVenueClick?: (venue: string) => void;
  onRead?: () => void;
}

export const NotificationCard = memo(({ notification, onVenueClick, onRead }: NotificationCardProps) => {
  const handleClick = () => {
    if (notification.venue && onVenueClick) {
      onVenueClick(notification.venue);
    }
    if (onRead && !notification.read) {
      onRead();
    }
  };
  const getIcon = () => {
    switch (notification.type) {
      case "offer":
        return <Gift className="w-5 h-5 text-primary" />;
      case "event":
        return <Clock className="w-5 h-5 text-secondary" />;
      case "trending":
        return <TrendingUp className="w-5 h-5 text-warm" />;
    }
  };

  const getGradient = () => {
    switch (notification.type) {
      case "offer":
        return "from-primary/10 to-primary-glow/10";
      case "event":
        return "from-secondary/10 to-secondary/10";
      case "trending":
        return "from-warm/10 to-hot/10";
    }
  };

  return (
    <div 
      className={`bg-gradient-to-r ${getGradient()} rounded-lg sm:rounded-xl p-3 sm:p-4 border border-border/50 hover-scale transition-all ${
        onVenueClick ? 'cursor-pointer' : ''
      } ${notification.read ? 'opacity-60' : ''}`}
      onClick={handleClick}
    >
      <div className="flex items-start gap-2 sm:gap-3">
        <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-primary/10 to-accent/10 rounded-full flex items-center justify-center flex-shrink-0 border border-primary/20 ring-1 ring-primary/10">
          {getIcon()}
        </div>
        
        <div className="flex-1 min-w-0">
          <h4 className="text-xs sm:text-sm font-bold text-foreground mb-0.5 sm:mb-1">{notification.title}</h4>
          <p className="text-[10px] sm:text-xs text-muted-foreground mb-1 sm:mb-2">{notification.message}</p>
          
          <div className="flex items-center gap-2 sm:gap-3 text-[10px] sm:text-xs text-muted-foreground">
            {notification.venue && (
              <div className="flex items-center gap-0.5 sm:gap-1">
                <MapPin className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                <span className="truncate">{notification.venue}</span>
              </div>
            )}
            
            {notification.distance && (
              <span className="text-primary font-medium flex-shrink-0">{notification.distance}</span>
            )}
          </div>
        </div>
        
        <div className="text-[10px] sm:text-xs text-muted-foreground flex-shrink-0">
          {notification.timestamp}
        </div>
      </div>
    </div>
  );
});

NotificationCard.displayName = "NotificationCard";
