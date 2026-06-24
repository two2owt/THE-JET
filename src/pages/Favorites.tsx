import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useFavorites } from "@/hooks/useFavorites";
import { Heart, Compass } from "lucide-react";
import { DealCard } from "@/components/DealCard";
import { useNavigate } from "react-router";
import { PageLayout } from "@/components/PageLayout";
import { EmptyState } from "@/components/EmptyState";
import { VirtualGrid } from "@/components/ui/virtual-list";
import { FavoritesPageSkeleton } from "@/components/skeletons/PageSkeletons";
import { PageShell } from "@/components/PageShell";
import { useAuth } from "@/contexts/AuthContext";
import { TabPageHeader } from "@/components/TabPageHeader";
import { rememberPostAuthRedirect } from "@/lib/postAuthRedirect";
import { SEO } from "@/components/SEO";

interface Deal {
  id: string;
  title: string;
  venue_name: string;
  description: string;
  deal_type: string;
  image_url: string | null;
  active_days: number[];
  starts_at: string;
  expires_at: string;
}

export default function Favorites() {
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();
  const [deals, setDeals] = useState<Deal[]>([]);
  const headerConfig = useMemo(() => ({}), []);

  const { favorites, loading: favoritesLoading } = useFavorites(user?.id);

  useEffect(() => {
    if (!user || favoritesLoading) return;

    if (favorites.length > 0) {
      fetchFavoriteDeals();
    }
  }, [favorites, favoritesLoading, user]);

  const fetchFavoriteDeals = async () => {
    try {
      // Favorites can point to either a deal id (uuid) or a map venue id (text).
      // Resolve both: pull deals by id for deal-linked rows, and pull the most
      // recent active deal per venue_id for venue-only rows, then dedupe.
      const dealIds = favorites
        .map((fav) => fav.deal_id)
        .filter((id): id is string => !!id);
      const venueIds = favorites
        .map((fav) => fav.venue_id)
        .filter((id): id is string => !!id);

      const queries: PromiseLike<Deal[]>[] = [];
      if (dealIds.length > 0) {
        queries.push(
          supabase
            .from("deals")
            .select("*")
            .in("id", dealIds)
            .eq("active", true)
            .then(({ data, error }) => {
              if (error) throw error;
              return (data || []) as Deal[];
            })
        );
      }
      if (venueIds.length > 0) {
        queries.push(
          supabase
            .from("deals")
            .select("*")
            .in("venue_id", venueIds)
            .eq("active", true)
            .then(({ data, error }) => {
              if (error) throw error;
              return (data || []) as Deal[];
            })
        );
      }

      const results = await Promise.all(queries);
      const seen = new Set<string>();
      const merged: Deal[] = [];
      for (const list of results) {
        for (const d of list) {
          if (!seen.has(d.id)) {
            seen.add(d.id);
            merged.push(d);
          }
        }
      }
      setDeals(merged);
    } catch (error) {
      console.error("Error fetching favorite deals:", error);
    }
  };

  if (authLoading) {
    return (
      <PageLayout defaultTab="favorites" headerConfig={headerConfig}>
        <PageShell>
          <FavoritesPageSkeleton />
        </PageShell>
      </PageLayout>
    );
  }

  if (!user) {
    return (
      <PageLayout defaultTab="favorites" notificationCount={0} headerConfig={headerConfig}>
        <PageShell>
          <EmptyState
            icon={Heart}
            title="Sign in to view favorites"
            description="Create an account to save and track your favorite deals across all venues"
            actionLabel="Sign In"
            onAction={() => { rememberPostAuthRedirect(); navigate("/auth"); }}
          />
        </PageShell>
      </PageLayout>
    );
  }

  if (favoritesLoading) {
    return (
      <PageLayout defaultTab="favorites" headerConfig={headerConfig}>
        <PageShell>
          <FavoritesPageSkeleton />
        </PageShell>
      </PageLayout>
    );
  }

  return (
    <PageLayout defaultTab="favorites" headerConfig={headerConfig}>
      <SEO
        title="Saved Deals — JET"
        description="Your saved venues and deals across Charlotte, ready when you are."
        path="/favorites"
      />
      <PageShell>
        <TabPageHeader
          title="Your Favorites"
          subtitle={
            deals.length === 0
              ? "Saved deals will appear here"
              : `${deals.length} saved ${deals.length === 1 ? "deal" : "deals"}`
          }
        />
        {deals.length === 0 ? (
          <EmptyState
            icon={Compass}
            title="No favorites yet"
            description="Start exploring and save deals you love! Your favorite venues and offers will appear here."
            actionLabel="Explore Deals"
            onAction={() => navigate("/?tab=explore")}
          />
        ) : (
          <VirtualGrid
            items={deals}
            estimateSize={280}
            className="min-h-[60vh]"
            columns={{ mobile: 1, tablet: 2, desktop: 3 }}
            getItemKey={(deal) => deal.id}
            renderItem={(deal, index) => <DealCard deal={deal} index={index} />}
          />
        )}
      </PageShell>
    </PageLayout>
  );
}
