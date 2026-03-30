import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useFavorites } from "@/hooks/useFavorites";
import { Heart, Compass } from "lucide-react";
import { DealCard } from "@/components/DealCard";
import { useNavigate } from "react-router";
import { PageLayout } from "@/components/PageLayout";
import { EmptyState } from "@/components/EmptyState";
import { VirtualGrid } from "@/components/ui/virtual-list";
import { FavoritesPageSkeleton } from "@/components/skeletons/PageSkeletons";

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
  const [user, setUser] = useState<any>(null);
  const [deals, setDeals] = useState<Deal[]>([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const { favorites, loading: favoritesLoading } = useFavorites(user?.id);

  useEffect(() => {
    if (!user || favoritesLoading) return;

    if (favorites.length > 0) {
      fetchFavoriteDeals();
    }
  }, [favorites, favoritesLoading, user]);

  const fetchFavoriteDeals = async () => {
    try {
      const dealIds = favorites.map((fav) => fav.deal_id);
      const { data, error } = await supabase
        .from("deals")
        .select("*")
        .in("id", dealIds)
        .eq("active", true);

      if (error) throw error;
      setDeals(data || []);
    } catch (error) {
      console.error("Error fetching favorite deals:", error);
    }
  };

  if (!user) {
    return (
      <PageLayout defaultTab="favorites" notificationCount={0}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 lg:px-10 py-fluid-lg">
          <EmptyState
            icon={Heart}
            title="Sign in to view favorites"
            description="Create an account to save and track your favorite deals across all venues"
            actionLabel="Sign In"
            onAction={() => navigate("/auth")}
          />
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout defaultTab="favorites">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 lg:px-10 py-fluid-lg">
        <div className="mb-fluid-lg">
          <h1 className="text-fluid-2xl sm:text-fluid-3xl font-extrabold bg-gradient-to-r from-foreground via-foreground to-primary bg-clip-text text-transparent mb-fluid-xs">My Favorites</h1>
          <p className="text-fluid-sm text-muted-foreground">
            {deals.length} {deals.length === 1 ? "deal" : "deals"} saved
          </p>
        </div>

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
      </div>
    </PageLayout>
  );
}
