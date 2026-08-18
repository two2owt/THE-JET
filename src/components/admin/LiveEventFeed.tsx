import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Activity,
  Star,
  Share2,
  MessageSquare,
  Users,
  MapPin,
  Search,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface LiveEvent {
  id: string;
  type: "favorite" | "share" | "review" | "connection" | "location" | "search";
  message: string;
  timestamp: Date;
  data?: Record<string, unknown>;
}

const eventConfig = {
  favorite: {
    icon: Star,
    color: "bg-yellow-500/20 text-yellow-400",
    label: "Favorite",
  },
  share: {
    icon: Share2,
    color: "bg-blue-500/20 text-blue-400",
    label: "Share",
  },
  review: {
    icon: MessageSquare,
    color: "bg-green-500/20 text-green-400",
    label: "Review",
  },
  connection: {
    icon: Users,
    color: "bg-purple-500/20 text-purple-400",
    label: "Connection",
  },
  location: {
    icon: MapPin,
    color: "bg-orange-500/20 text-orange-400",
    label: "Location",
  },
  search: {
    icon: Search,
    color: "bg-cyan-500/20 text-cyan-400",
    label: "Search",
  },
};

export const LiveEventFeed = () => {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  const addEvent = (event: LiveEvent) => {
    setEvents((prev) => [event, ...prev].slice(0, 50)); // Keep last 50 events
  };

  useEffect(() => {
    // Subscribe to user_favorites changes
    const favoritesChannel = supabase
      .channel("favorites-changes")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "user_favorites" },
        (payload) => {
          addEvent({
            id: payload.new.id,
            type: "favorite",
            message: "New deal favorited",
            timestamp: new Date(payload.new.created_at),
            data: payload.new,
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "user_favorites" },
        (payload) => {
          addEvent({
            id: crypto.randomUUID(),
            type: "favorite",
            message: "Deal unfavorited",
            timestamp: new Date(),
            data: payload.old,
          });
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setIsConnected(true);
      });

    // Subscribe to deal_shares changes
    const sharesChannel = supabase
      .channel("shares-changes")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "deal_shares" },
        (payload) => {
          addEvent({
            id: payload.new.id,
            type: "share",
            message: "Deal shared",
            timestamp: new Date(payload.new.shared_at),
            data: payload.new,
          });
        },
      )
      .subscribe();

    // Subscribe to venue_reviews changes
    const reviewsChannel = supabase
      .channel("reviews-changes")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "venue_reviews" },
        (payload) => {
          addEvent({
            id: payload.new.id,
            type: "review",
            message: `New ${payload.new.rating}★ review for ${payload.new.venue_name}`,
            timestamp: new Date(payload.new.created_at),
            data: payload.new,
          });
        },
      )
      .subscribe();

    // Subscribe to user_connections changes
    const connectionsChannel = supabase
      .channel("connections-changes")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "user_connections" },
        (payload) => {
          addEvent({
            id: payload.new.id,
            type: "connection",
            message: "New friend request sent",
            timestamp: new Date(payload.new.created_at),
            data: payload.new,
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "user_connections" },
        (payload) => {
          if (payload.new.status === "accepted") {
            addEvent({
              id: payload.new.id,
              type: "connection",
              message: "Friend request accepted",
              timestamp: new Date(payload.new.updated_at),
              data: payload.new,
            });
          }
        },
      )
      .subscribe();

    // Subscribe to search_history changes
    const searchChannel = supabase
      .channel("search-changes")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "search_history" },
        (payload) => {
          addEvent({
            id: payload.new.id,
            type: "search",
            message: `Searched: "${payload.new.search_query}"`,
            timestamp: new Date(payload.new.created_at),
            data: payload.new,
          });
        },
      )
      .subscribe();

    // Subscribe to user_locations changes
    const locationsChannel = supabase
      .channel("locations-changes")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "user_locations" },
        (payload) => {
          addEvent({
            id: payload.new.id,
            type: "location",
            message: "User location updated",
            timestamp: new Date(payload.new.created_at),
            data: payload.new,
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(favoritesChannel);
      supabase.removeChannel(sharesChannel);
      supabase.removeChannel(reviewsChannel);
      supabase.removeChannel(connectionsChannel);
      supabase.removeChannel(searchChannel);
      supabase.removeChannel(locationsChannel);
    };
  }, []);

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              Live Activity Feed
            </CardTitle>
            <CardDescription>Real-time user actions</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${isConnected ? "bg-green-500 animate-pulse" : "bg-muted"}`}
            />
            <span className="text-xs text-muted-foreground">
              {isConnected ? "Live" : "Connecting..."}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[300px] pr-4">
          {events.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <Activity className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">Waiting for live events...</p>
              <p className="text-xs mt-1">
                Events will appear here in real-time
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {events.map((event) => {
                const config = eventConfig[event.type];
                const Icon = config.icon;
                return (
                  <div
                    key={event.id}
                    className="flex items-start gap-3 p-2 rounded-lg bg-background/50 border border-border/30 animate-in slide-in-from-top-2 duration-300"
                  >
                    <div className={`p-1.5 rounded-md ${config.color}`}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {event.message}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(event.timestamp, {
                          addSuffix: true,
                        })}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-xs shrink-0">
                      {config.label}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
};
