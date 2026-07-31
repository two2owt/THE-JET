import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, MapPin, Bell, TrendingUp, Star, Activity, Eye, Search, Share2 } from "lucide-react";
import { Loader2 } from "lucide-react";
import { format, subDays } from "date-fns";
import { LiveEventFeed } from "./LiveEventFeed";

// Lazy load chart components - Recharts is ~200KB+ and only needed when viewing analytics
const UserGrowthChart = lazy(() => import("./AnalyticsCharts").then(m => ({ default: m.UserGrowthChart })));
const EngagementChart = lazy(() => import("./AnalyticsCharts").then(m => ({ default: m.EngagementChart })));
const DealTypePieChart = lazy(() => import("./AnalyticsCharts").then(m => ({ default: m.DealTypePieChart })));
const LocationActivityChart = lazy(() => import("./AnalyticsCharts").then(m => ({ default: m.LocationActivityChart })));

const ChartFallback = () => (
  <div className="flex items-center justify-center h-[200px]">
    <Loader2 className="w-6 h-6 animate-spin text-primary" />
  </div>
);

export const UserAnalytics = () => {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-analytics'],
    queryFn: async () => {
      const sevenDaysAgo = subDays(new Date(), 7).toISOString();
      
      // Basic counts
      // Authoritative account list (auth users) + sync status, admin-only RPCs.
      const [directoryRes, syncRes] = await Promise.all([
        supabase.rpc('admin_user_directory'),
        supabase.rpc('admin_user_sync_status'),
      ]);
      const directory = directoryRes.data ?? [];
      const syncStatus = syncRes.data?.[0] ?? null;

      const [
        usersRes, 
        locationsRes, 
        notificationsRes, 
        profilesRes, 
        activeDealsRes,
        favoritesRes,
        searchesRes,
        sharesRes,
        reviewsRes,
        connectionsRes
      ] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('user_locations').select('id', { count: 'exact', head: true }),
        supabase.from('notification_logs').select('id', { count: 'exact', head: true }),
        supabase.from('profiles').select('onboarding_completed, created_at'),
        supabase.from('deals').select('id', { count: 'exact', head: true }).eq('active', true),
        supabase.from('user_favorites').select('id', { count: 'exact', head: true }),
        supabase.from('search_history').select('id', { count: 'exact', head: true }),
        supabase.from('deal_shares').select('id', { count: 'exact', head: true }),
        supabase.from('venue_reviews').select('id', { count: 'exact', head: true }),
        supabase.from('user_connections').select('id', { count: 'exact', head: true })
      ]);

      // Prefer the account directory so counts always match the auth database;
      // fall back to profiles if the RPC is unavailable (non-admin viewer).
      const useDirectory = directory.length > 0;
      const completedOnboarding = useDirectory
        ? directory.filter((u) => u.onboarding_completed).length
        : profilesRes.data?.filter((p) => p.onboarding_completed).length || 0;
      const recentUsers = useDirectory
        ? directory.filter((u) => u.created_at >= sevenDaysAgo)
        : profilesRes.data?.filter((u) => u.created_at >= sevenDaysAgo) || [];

      // User growth over last 7 days
      const userGrowth = Array.from({ length: 7 }, (_, i) => {
        const date = subDays(new Date(), 6 - i);
        const dateStr = format(date, 'MM/dd');
        const count = recentUsers.filter(u => 
          format(new Date(u.created_at), 'MM/dd') === dateStr
        ).length;
        return { date: dateStr, users: count };
      });

      // Popular venues (by deal count)
      const { data: venues } = await supabase
        .from('deals')
        .select('venue_name, venue_id')
        .eq('active', true);

      const venueStats = venues?.reduce((acc, deal) => {
        const existing = acc.find(v => v.venue_id === deal.venue_id);
        if (existing) {
          existing.count++;
        } else {
          acc.push({ venue_name: deal.venue_name, venue_id: deal.venue_id, count: 1 });
        }
        return acc;
      }, [] as { venue_name: string; venue_id: string; count: number }[])
        .sort((a, b) => b.count - a.count)
        .slice(0, 5) || [];

      // Location tracking activity (last 7 days)
      const { data: recentLocations } = await supabase
        .from('user_locations')
        .select('created_at')
        .gte('created_at', sevenDaysAgo)
        .order('created_at', { ascending: true });

      const locationActivity = Array.from({ length: 7 }, (_, i) => {
        const date = subDays(new Date(), 6 - i);
        const dateStr = format(date, 'MM/dd');
        const count = recentLocations?.filter(l => 
          format(new Date(l.created_at), 'MM/dd') === dateStr
        ).length || 0;
        return { date: dateStr, locations: count };
      });

      // Deal type distribution
      const { data: dealTypes } = await supabase
        .from('deals')
        .select('deal_type')
        .eq('active', true);

      const dealTypeStats = dealTypes?.reduce((acc, deal) => {
        const existing = acc.find(d => d.type === deal.deal_type);
        if (existing) {
          existing.count++;
        } else {
          acc.push({ type: deal.deal_type, count: 1 });
        }
        return acc;
      }, [] as { type: string; count: number }[]) || [];

      // Popular searches (last 7 days)
      const { data: searches } = await supabase
        .from('search_history')
        .select('search_query')
        .gte('created_at', sevenDaysAgo);

      const searchStats = searches?.reduce((acc, search) => {
        const query = search.search_query.toLowerCase();
        const existing = acc.find(s => s.query === query);
        if (existing) {
          existing.count++;
        } else {
          acc.push({ query, count: 1 });
        }
        return acc;
      }, [] as { query: string; count: number }[])
        .sort((a, b) => b.count - a.count)
        .slice(0, 5) || [];

      // Social engagement trends (last 7 days)
      const { data: recentShares } = await supabase
        .from('deal_shares')
        .select('shared_at')
        .gte('shared_at', sevenDaysAgo);

      const { data: recentReviews } = await supabase
        .from('venue_reviews')
        .select('created_at')
        .gte('created_at', sevenDaysAgo);

      const engagementActivity = Array.from({ length: 7 }, (_, i) => {
        const date = subDays(new Date(), 6 - i);
        const dateStr = format(date, 'MM/dd');
        const shares = recentShares?.filter(s => 
          format(new Date(s.shared_at), 'MM/dd') === dateStr
        ).length || 0;
        const reviews = recentReviews?.filter(r => 
          format(new Date(r.created_at), 'MM/dd') === dateStr
        ).length || 0;
        return { date: dateStr, shares, reviews };
      });

      return {
        totalUsers: useDirectory ? directory.length : usersRes.count || 0,
        profileCount: usersRes.count || 0,
        syncStatus,
        totalLocations: locationsRes.count || 0,
        totalNotifications: notificationsRes.count || 0,
        totalFavorites: favoritesRes.count || 0,
        totalSearches: searchesRes.count || 0,
        totalShares: sharesRes.count || 0,
        totalReviews: reviewsRes.count || 0,
        totalConnections: connectionsRes.count || 0,
        completedOnboarding,
        activeDeals: activeDealsRes.count || 0,
        userGrowth,
        popularVenues: venueStats,
        locationActivity,
        dealTypeStats,
        popularSearches: searchStats,
        engagementActivity
      };
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const weeklyShares = data?.engagementActivity?.reduce((sum, d) => sum + d.shares, 0) || 0;
  const weeklyReviews = data?.engagementActivity?.reduce((sum, d) => sum + d.reviews, 0) || 0;
  const engagementRate = data?.completedOnboarding && data?.totalUsers 
    ? Math.round((data.completedOnboarding / data.totalUsers) * 100)
    : 0;

  const cards = [
    {
      title: "Total Users",
      value: data?.totalUsers || 0,
      icon: Users,
      description: "Registered users",
      trend: `${data?.userGrowth?.slice(-1)[0]?.users || 0} new today`
    },
    {
      title: "Active Deals",
      value: data?.activeDeals || 0,
      icon: Star,
      description: "Currently running",
      trend: "Live deals"
    },
    {
      title: "User Engagement",
      value: `${engagementRate}%`,
      icon: TrendingUp,
      description: "Onboarding completion",
      trend: `${data?.completedOnboarding || 0} completed`
    },
    {
      title: "Social Activity",
      value: data?.totalShares || 0,
      icon: Share2,
      description: "Total deal shares",
      trend: `${weeklyShares} this week`
    }
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Analytics Dashboard</h2>
        <p className="text-muted-foreground">Real-time platform metrics from Supabase • Auto-refreshes every 30 seconds</p>
      </div>

      {/* Live Event Feed */}
      <LiveEventFeed />

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.title} className="bg-card/50 backdrop-blur-sm border-border/50">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {card.title}
                </CardTitle>
                <Icon className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{typeof card.value === 'number' ? card.value.toLocaleString() : card.value}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {card.description}
                </p>
                <p className="text-xs text-primary/70 mt-1">
                  {card.trend}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Charts Row */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              User Growth (7 Days)
            </CardTitle>
            <CardDescription>New user registrations per day</CardDescription>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<ChartFallback />}>
              <UserGrowthChart data={data?.userGrowth || []} />
            </Suspense>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              Social Engagement
            </CardTitle>
            <CardDescription>Shares and reviews over the last week</CardDescription>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<ChartFallback />}>
              <EngagementChart data={data?.engagementActivity || []} />
            </Suspense>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Star className="h-5 w-5 text-primary" />
              Top Venues
            </CardTitle>
            <CardDescription>Venues with most active deals</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data?.popularVenues && data.popularVenues.length > 0 ? (
                data.popularVenues.map((venue, idx) => (
                  <div key={venue.venue_id} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-semibold text-sm">
                        {idx + 1}
                      </div>
                      <div>
                        <p className="font-medium text-sm">{venue.venue_name}</p>
                        <p className="text-xs text-muted-foreground">{venue.count} active deals</p>
                      </div>
                    </div>
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No venue data available</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5 text-primary" />
              Popular Searches
            </CardTitle>
            <CardDescription>Top search queries this week</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data?.popularSearches && data.popularSearches.length > 0 ? (
                data.popularSearches.map((search, idx) => (
                  <div key={idx} className="flex items-center justify-between">
                    <p className="text-sm font-medium text-foreground truncate">{search.query}</p>
                    <span className="text-xs text-primary font-semibold ml-2">{search.count}</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No search data available</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Third Row */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              Deal Categories
            </CardTitle>
            <CardDescription>Distribution of active deals by type</CardDescription>
          </CardHeader>
          <CardContent>
            {data?.dealTypeStats && data.dealTypeStats.length > 0 ? (
              <Suspense fallback={<ChartFallback />}>
                <DealTypePieChart data={data.dealTypeStats} />
              </Suspense>
            ) : (
              <p className="text-sm text-muted-foreground">No deal data available</p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              Location Activity
            </CardTitle>
            <CardDescription>User check-ins over the last week</CardDescription>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<ChartFallback />}>
              <LocationActivityChart data={data?.locationActivity || []} />
            </Suspense>
          </CardContent>
        </Card>
      </div>

      {/* Platform Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" />
              Notifications
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Total Sent</span>
                <span className="text-sm font-bold">{data?.totalNotifications?.toLocaleString() || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Avg per User</span>
                <span className="text-sm font-bold">
                  {data?.completedOnboarding && data?.totalNotifications 
                    ? (data.totalNotifications / data.completedOnboarding).toFixed(1)
                    : 0}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Star className="h-5 w-5 text-primary" />
              Favorites & Reviews
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Total Favorites</span>
                <span className="text-sm font-bold">{data?.totalFavorites?.toLocaleString() || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Total Reviews</span>
                <span className="text-sm font-bold">{data?.totalReviews?.toLocaleString() || 0}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Social Network
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Connections</span>
                <span className="text-sm font-bold">{data?.totalConnections?.toLocaleString() || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">This Week</span>
                <span className="text-sm font-bold">{weeklyReviews + weeklyShares}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
