import { useEffect, useId, useState } from "react";
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

const MAX_EVENTS = 50;

export const LiveEventFeed = () => {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const channelId = useId();

  useEffect(() => {
    let cancelled = false;

    // Dedupe by id and keep the list newest-first: the initial backfill and the
    // realtime stream can both deliver the same row when a write lands while
    // the feed is mounting.
    const addEvents = (incoming: LiveEvent[]) => {
      if (cancelled || incoming.length === 0) return;
      setEvents((prev) => {
        const seen = new Set(prev.map((e) => e.id));
        const fresh = incoming.filter((e) => !seen.has(e.id));
        if (fresh.length === 0) return prev;
        return [...fresh, ...prev]
          .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
          .slice(0, MAX_EVENTS);
      });
    };

    const addEvent = (event: LiveEvent) => addEvents([event]);

    // Realtime only delivers rows written *after* subscribe(), so without this
    // backfill the panel sat on "Waiting for live events..." indefinitely on
    // every page load even though the platform was busy.
    const backfill = async () => {
      const limit = 15;
      const [favorites, shares, reviews, connections, searches] =
        await Promise.all([
          supabase
            .from("user_favorites")
            .select("id, venue_name, created_at")
            .order("created_at", { ascending: false })
            .limit(limit),
          supabase
            .from("deal_shares")
            .select("id, shared_at")
            .order("shared_at", { ascending: false })
            .limit(limit),
          supabase
            .from("venue_reviews")
            .select("id, rating, venue_name, created_at")
            .order("created_at", { ascending: false })
            .limit(limit),
          supabase
            .from("user_connections")
            .select("id, status, created_at, updated_at")
            .order("updated_at", { ascending: false })
            .limit(limit),
          supabase
            .from("search_history")
            .select("id, search_query, created_at")
            .order("created_at", { ascending: false })
            .limit(limit),
        ]);

      const seeded: LiveEvent[] = [
        ...(favorites.data ?? []).map((row) => ({
          id: row.id,
          type: "favorite" as const,
          message: row.venue_name
            ? `${row.venue_name} favorited`
            : "New deal favorited",
          timestamp: new Date(row.created_at),
        })),
        ...(shares.data ?? []).map((row) => ({
          id: row.id,
          type: "share" as const,
          message: "Deal shared",
          timestamp: new Date(row.shared_at),
        })),
        ...(reviews.data ?? []).map((row) => ({
          id: row.id,
          type: "review" as const,
          message: `New ${row.rating}★ review for ${row.venue_name}`,
          timestamp: new Date(row.created_at),
        })),
        ...(connections.data ?? []).map((row) => ({
          id: row.id,
          type: "connection" as const,
          message:
            row.status === "accepted"
              ? "Friend request accepted"
              : "New friend request sent",
          timestamp: new Date(row.updated_at ?? row.created_at),
        })),
        ...(searches.data ?? []).map((row) => ({
          id: row.id,
          type: "search" as const,
          message: `Searched: "${row.search_query}"`,
          timestamp: new Date(row.created_at),
        })),
      ];

      addEvents(seeded);
    };

    void backfill();

    // One channel per feed instance: a shared static topic name collides with
    // other subscribers and makes postgres_changes callbacks fail to bind.
    const channel = supabase
      .channel(`admin-live-feed-${channelId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "user_favorites" },
        (payload) => {
          addEvent({
            id: payload.new.id,
            type: "favorite",
            message: payload.new.venue_name
              ? `${payload.new.venue_name} favorited`
              : "New deal favorited",
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
      // user_locations is deliberately NOT published to realtime (precise
      // coordinates must never be broadcast), so the feed listens to the
      // aggregate map_data_pulse heartbeat instead: timestamp + row count only.
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "map_data_pulse" },
        (payload) => {
          const row = payload.new as { updated_at?: string } | null;
          addEvent({
            id: crypto.randomUUID(),
            type: "location",
            message: "User location activity recorded",
            timestamp: row?.updated_at ? new Date(row.updated_at) : new Date(),
          });
        },
      )
      .subscribe((status) => {
        if (cancelled) return;
        setIsConnected(status === "SUBSCRIBED");
      });

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [channelId]);

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
