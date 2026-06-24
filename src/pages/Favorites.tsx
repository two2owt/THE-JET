import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useFavorites, type Favorite } from "@/hooks/useFavorites";
import { Heart, Compass, MapPin, Loader2 } from "lucide-react";
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
  venue_id?: string | null;
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
    } else {
      setDeals([]);
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

  // Venue-only favorites: rows where the user hearted a map venue with no
  // currently-active deal. Render these as lightweight venue cards so the
  // favorites page holds BOTH venue favorites and deal favorites.
  const venueOnlyFavorites = useMemo<Favorite[]>(() => {
    const coveredVenueIds = new Set(
      deals.map((d) => d.venue_id).filter((v): v is string => !!v),
    );
    return favorites.filter(
      (f) =>
        f.venue_id &&
        !coveredVenueIds.has(f.venue_id) &&
        // require at least a name to render something useful
        (f.venue_name || f.venue_address),
    );
  }, [favorites, deals]);

  const totalCount = deals.length + venueOnlyFavorites.length;

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
            totalCount === 0
              ? "Saved deals will appear here"
              : `${totalCount} saved ${totalCount === 1 ? "item" : "items"}`
          }
        />
        {totalCount === 0 ? (
          <EmptyState
            icon={Compass}
            title="No favorites yet"
            description="Start exploring and save deals you love! Your favorite venues and offers will appear here."
            actionLabel="Explore Deals"
            onAction={() => navigate("/?tab=explore")}
          />
        ) : (
          <div className="space-y-8">
            {deals.length > 0 && (
              <section>
                <h2 className="text-sm uppercase tracking-wider text-muted-foreground mb-3 px-1">
                  Saved deals
                </h2>
                <VirtualGrid
                  items={deals}
                  estimateSize={280}
                  className="min-h-[20vh]"
                  columns={{ mobile: 1, tablet: 2, desktop: 3 }}
                  getItemKey={(deal) => deal.id}
                  renderItem={(deal, index) => <DealCard deal={deal} index={index} />}
                />
              </section>
            )}
            {venueOnlyFavorites.length > 0 && (
              <section>
                <h2 className="text-sm uppercase tracking-wider text-muted-foreground mb-3 px-1">
                  Saved venues
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {venueOnlyFavorites.map((f) => (
                    <FavoriteVenueCard
                      key={f.id}
                      favorite={f}
                      onOpen={() => {
                        if (f.venue_id) navigate(`/?venue=${encodeURIComponent(f.venue_id)}`);
                      }}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </PageShell>
    </PageLayout>
  );
}

function FavoriteVenueCard({
  favorite,
  onOpen,
}: {
  favorite: Favorite;
  onOpen: () => void;
}) {
  const { toggleVenueFavorite } = useFavorites(favorite.user_id);
  const [removing, setRemoving] = useState(false);

  const handleUnfavorite = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (removing || !favorite.venue_id) return;
    setRemoving(true);
    try {
      await toggleVenueFavorite(favorite.venue_id, favorite.deal_id);
    } finally {
      setRemoving(false);
    }
  };

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative text-left rounded-2xl overflow-hidden border border-border bg-card/60 backdrop-blur-sm hover:border-primary/40 transition-colors"
    >
      <div className="relative aspect-[16/10] bg-muted">
        {favorite.venue_image_url ? (
          <img
            src={favorite.venue_image_url}
            alt={favorite.venue_name ?? "Saved venue"}
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            <MapPin className="w-8 h-8" />
          </div>
        )}
        <button
          type="button"
          onClick={handleUnfavorite}
          aria-label={`Remove ${favorite.venue_name ?? "venue"} from favorites`}
          disabled={removing}
          className="absolute top-2 right-2 w-9 h-9 rounded-full bg-black/55 backdrop-blur-md flex items-center justify-center text-primary hover:bg-black/70 transition"
        >
          {removing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Heart className="w-4 h-4 fill-current" />
          )}
        </button>
      </div>
      <div className="p-3">
        <div className="font-semibold truncate">
          {favorite.venue_name ?? "Saved venue"}
        </div>
        <div className="text-xs text-muted-foreground truncate mt-0.5">
          {favorite.venue_neighborhood ?? favorite.venue_address ?? favorite.venue_category ?? ""}
        </div>
      </div>
    </button>
  );
}
