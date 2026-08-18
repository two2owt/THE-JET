import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useFavorites, type Favorite } from "@/hooks/useFavorites";
import { Heart, Compass, MapPin, Loader2, AlertTriangle } from "lucide-react";
import { DealCard } from "@/components/DealCard";
import { useNavigate } from "@/lib/router-compat";
import { PageLayout } from "@/components/PageLayout";
import { EmptyState } from "@/components/EmptyState";
import { VirtualGrid } from "@/components/ui/virtual-list";
import { FavoritesPageSkeleton } from "@/components/skeletons/PageSkeletons";
import { PageShell } from "@/components/PageShell";
import { useAuth } from "@/contexts/AuthContext";
import { TabPageHeader } from "@/components/TabPageHeader";
import { rememberPostAuthRedirect } from "@/lib/postAuthRedirect";
import { SEO } from "@/components/SEO";
import { useVenuePhoto } from "@/hooks/useVenuePhoto";
import { Trash2, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<
    "recent" | "name" | "venue" | "expiring"
  >("recent");
  const headerConfig = useMemo(() => ({}), []);

  const {
    favorites,
    loading: favoritesLoading,
    toggleVenueFavorite,
  } = useFavorites(user?.id);

  useEffect(() => {
    if (!user || favoritesLoading) return;

    if (favorites.length > 0) {
      fetchFavoriteDeals();
    } else {
      setLoadError(false);
      setDeals([]);
    }
  }, [favorites, favoritesLoading, user]);

  const fetchFavoriteDeals = async () => {
    try {
      setLoadError(false);
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
            }),
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
            }),
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
      setLoadError(true);
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

  // When a favorite was saved, keyed by deal id and venue id, so both lists
  // can share the same "recently saved" ordering.
  const savedAt = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of favorites) {
      const t = new Date(f.created_at).getTime() || 0;
      if (f.deal_id) map.set(`deal:${f.deal_id}`, t);
      if (f.venue_id) map.set(`venue:${f.venue_id}`, t);
    }
    return map;
  }, [favorites]);

  const normalizedQuery = query.trim().toLowerCase();

  const visibleDeals = useMemo(() => {
    const filtered = normalizedQuery
      ? deals.filter((d) =>
          [d.title, d.venue_name, d.description, d.deal_type]
            .filter(Boolean)
            .some((v) => v!.toLowerCase().includes(normalizedQuery)),
        )
      : deals;
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.title.localeCompare(b.title);
        case "venue":
          return (a.venue_name || "").localeCompare(b.venue_name || "");
        case "expiring":
          return (
            (new Date(a.expires_at).getTime() || Infinity) -
            (new Date(b.expires_at).getTime() || Infinity)
          );
        default: {
          const at =
            savedAt.get(`deal:${a.id}`) ??
            savedAt.get(`venue:${a.venue_id ?? ""}`) ??
            0;
          const bt =
            savedAt.get(`deal:${b.id}`) ??
            savedAt.get(`venue:${b.venue_id ?? ""}`) ??
            0;
          return bt - at;
        }
      }
    });
    return sorted;
  }, [deals, normalizedQuery, sortBy, savedAt]);

  const visibleVenues = useMemo(() => {
    const filtered = normalizedQuery
      ? venueOnlyFavorites.filter((f) =>
          [f.venue_name, f.venue_address, f.venue_category, f.venue_neighborhood]
            .filter(Boolean)
            .some((v) => v!.toLowerCase().includes(normalizedQuery)),
        )
      : venueOnlyFavorites;
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      switch (sortBy) {
        case "name":
        case "venue":
          return (a.venue_name || "").localeCompare(b.venue_name || "");
        case "expiring":
          // Venue favorites have no expiry; keep them stable by name.
          return (a.venue_name || "").localeCompare(b.venue_name || "");
        default:
          return (
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
      }
    });
    return sorted;
  }, [venueOnlyFavorites, normalizedQuery, sortBy]);

  const visibleCount = visibleDeals.length + visibleVenues.length;

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
      <PageLayout defaultTab="favorites" headerConfig={headerConfig}>
        <PageShell>
          <EmptyState
            icon={Heart}
            title="Sign in to view favorites"
            description="Create an account to save and track your favorite deals across all venues"
            actionLabel="Sign In"
            onAction={() => {
              rememberPostAuthRedirect();
              navigate("/auth");
            }}
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
        {loadError && totalCount === 0 ? (
          <EmptyState
            icon={AlertTriangle}
            title="Couldn't load your favorites"
            description="Something went wrong reaching the network. Check your connection and try again."
            actionLabel="Retry"
            onAction={() => {
              void fetchFavoriteDeals();
            }}
          />
        ) : totalCount === 0 ? (
          <EmptyState
            icon={Compass}
            title="No favorites yet"
            description="Start exploring and save deals you love! Your favorite venues and offers will appear here."
            actionLabel="Explore Deals"
            onAction={() => navigate("/?tab=explore")}
          />
        ) : (
          <div className="space-y-8">
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search saved venues and deals"
                  aria-label="Search favorites"
                  className="pl-9 pr-9 h-11"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    aria-label="Clear search"
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 grid place-items-center rounded-full text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <Select
                value={sortBy}
                onValueChange={(v) => setSortBy(v as typeof sortBy)}
              >
                <SelectTrigger
                  className="h-11 w-full sm:w-[190px]"
                  aria-label="Sort favorites"
                >
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recent">Recently saved</SelectItem>
                  <SelectItem value="name">Name (A–Z)</SelectItem>
                  <SelectItem value="venue">Venue (A–Z)</SelectItem>
                  <SelectItem value="expiring">Expiring soon</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {visibleCount === 0 && (
              <EmptyState
                icon={Search}
                title="No matches"
                description={`Nothing in your favorites matches "${query.trim()}".`}
                actionLabel="Clear search"
                onAction={() => setQuery("")}
              />
            )}
            {visibleDeals.length > 0 && (
              <section>
                <h2 className="text-sm uppercase tracking-wider text-muted-foreground mb-3 px-1">
                  Saved deals
                </h2>
                <VirtualGrid
                  items={visibleDeals}
                  estimateSize={280}
                  className="min-h-[20svh]"
                  columns={{ mobile: 1, tablet: 2, desktop: 3 }}
                  getItemKey={(deal) => deal.id}
                  renderItem={(deal, index) => (
                    <DealCard deal={deal} index={index} />
                  )}
                />
              </section>
            )}
            {visibleVenues.length > 0 && (
              <section>
                <h2 className="text-sm uppercase tracking-wider text-muted-foreground mb-3 px-1">
                  Saved venues
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {visibleVenues.map((f) => (
                    <FavoriteVenueCard
                      key={f.id}
                      favorite={f}
                      onRemove={toggleVenueFavorite}
                      onOpen={() => {
                        if (f.venue_id)
                          navigate(`/?venue=${encodeURIComponent(f.venue_id)}`);
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
  onRemove,
}: {
  favorite: Favorite;
  onOpen: () => void;
  onRemove: (venueId: string, dealId?: string | null) => Promise<void>;
}) {
  const [removing, setRemoving] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Same Google Places photo resolution used by the JetCard hero image.
  const photoInput = useMemo(
    () =>
      favorite.venue_id && favorite.venue_name
        ? {
            id: favorite.venue_id,
            name: favorite.venue_name,
            address: favorite.venue_address ?? undefined,
            lat: favorite.venue_lat ?? undefined,
            lng: favorite.venue_lng ?? undefined,
          }
        : null,
    [
      favorite.venue_id,
      favorite.venue_name,
      favorite.venue_address,
      favorite.venue_lat,
      favorite.venue_lng,
    ],
  );
  const { photoUrl, loading: photoLoading } = useVenuePhoto(photoInput, 600);
  const heroImage = !imgFailed
    ? (photoUrl ?? favorite.venue_image_url ?? null)
    : null;

  const handleUnfavorite = async () => {
    if (removing || !favorite.venue_id) return;
    setRemoving(true);
    try {
      await onRemove(favorite.venue_id, favorite.deal_id);
      toast.success("Removed from favorites", {
        description: favorite.venue_name ?? undefined,
      });
    } finally {
      setRemoving(false);
      setConfirmOpen(false);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      aria-label={`Open ${favorite.venue_name ?? "saved venue"} on the map`}
      className="group relative cursor-pointer text-left rounded-2xl overflow-hidden border border-border bg-card/60 backdrop-blur-sm hover:border-primary/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      style={{ containerType: "inline-size" }}
    >
      {/* Hero sizing matches JetCard: container-relative (cqw), 16/9, same clamp. */}
      <div
        className="relative bg-muted"
        style={{
          width: "100%",
          aspectRatio: "16 / 9",
          maxHeight: "clamp(96px, 26cqw, 180px)",
          overflow: "hidden",
        }}
      >
        {/* Branded fallback sits underneath so slow networks never show an empty tile. */}
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
          <MapPin className="w-8 h-8" />
        </div>
        {photoLoading && !heroImage && (
          <div
            aria-hidden="true"
            className="absolute inset-0 animate-pulse bg-muted/40"
          />
        )}
        {heroImage && (
          <img
            src={heroImage}
            alt={favorite.venue_name ?? "Saved venue"}
            loading="lazy"
            decoding="async"
            onError={() => setImgFailed(true)}
            className="absolute inset-0 w-full h-full object-cover transition-opacity duration-200"
          />
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setConfirmOpen(true);
          }}
          aria-label={`Remove ${favorite.venue_name ?? "venue"} from favorites`}
          disabled={removing}
          className="absolute top-2 right-2 w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-background/60 backdrop-blur-md flex items-center justify-center text-primary hover:bg-background/80 transition"
        >
          {removing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Heart className="w-4 h-4 fill-current" />
          )}
        </button>
      </div>
      <div className="p-3">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="font-semibold truncate">
              {favorite.venue_name ?? "Saved venue"}
            </div>
            <div className="text-xs text-muted-foreground truncate mt-0.5">
              {favorite.venue_neighborhood ??
                favorite.venue_address ??
                favorite.venue_category ??
                ""}
            </div>
          </div>
          {/* Quick action: explicit remove, always visible next to the title. */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setConfirmOpen(true);
            }}
            disabled={removing}
            aria-label={`Remove ${favorite.venue_name ?? "venue"} from favorites`}
            className="shrink-0 w-11 h-11 min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from favorites?</AlertDialogTitle>
            <AlertDialogDescription>
              {favorite.venue_name ?? "This venue"} will no longer appear in
              your saved list. You can save it again from the map anytime.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Keep</AlertDialogCancel>
            <AlertDialogAction
              disabled={removing}
              onClick={(e) => {
                e.preventDefault();
                void handleUnfavorite();
              }}
            >
              {removing ? "Removing…" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
