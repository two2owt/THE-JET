import { useEffect, useState, useMemo } from "react";
import { usePersistentViewState } from "@/hooks/usePersistentViewState";
import { supabase } from "@/integrations/supabase/client";
import { useFavorites, type Favorite } from "@/hooks/useFavorites";
import { Heart, Compass, MapPin, Loader2, AlertTriangle } from "lucide-react";
import { DealCard } from "@/components/DealCard";
import { useNavigate } from "@/lib/router-compat";
import { PageLayout } from "@/components/PageLayout";
import { EmptyState } from "@/components/EmptyState";
import { SignedOutPreview } from "@/components/SignedOutPreview";
import { VirtualGrid } from "@/components/ui/virtual-list";
import { FavoritesPageSkeleton } from "@/components/skeletons/PageSkeletons";
import { PageShell } from "@/components/PageShell";
import { useAuth } from "@/contexts/AuthContext";
import { TabPageHeader } from "@/components/TabPageHeader";
import { rememberPostAuthRedirect } from "@/lib/postAuthRedirect";
import { useVenuePhoto } from "@/hooks/useVenuePhoto";
import { ShareDeepLinkButton } from "@/components/ShareDeepLinkButton";
import { trackDeepLinkOpened } from "@/lib/deepLinkAnalytics";
import { Trash2, Search, X, Bell } from "lucide-react";
import { useFavoriteAlerts } from "@/hooks/useFavoriteAlerts";
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
  const [query, setQuery] = usePersistentViewState("favorites:query", "");
  const [sortBy, setSortBy] = usePersistentViewState<
    "recent" | "name" | "venue" | "expiring"
  >("favorites:sort", "recent");
  const [filter, setFilter] = usePersistentViewState<
    "all" | "venues" | "deals"
  >("favorites:filter", "all");
  const headerConfig = useMemo(() => ({ hideSearch: true }), []);

  const {
    favorites,
    loading: favoritesLoading,
    toggleVenueFavorite,
    refetch: refetchFavorites,
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

  // Alerts that belong to the user's saved venues/deals, so the tab can badge
  // exactly which favorite has news and open its JetCard on tap.
  const { byVenue, byDeal, totalUnread, markFavoriteAlertsRead } =
    useFavoriteAlerts(favorites, !!user);

  const openFavorite = (venueId?: string | null, dealId?: string | null) => {
    void markFavoriteAlertsRead({ venueId, dealId });
    if (venueId) {
      trackDeepLinkOpened("venue", venueId, "favorites", "loaded_venues");
      navigate(`/?venue=${encodeURIComponent(venueId)}`);
    } else if (dealId) {
      trackDeepLinkOpened("deal", dealId, "favorites", "loaded_venues");
      navigate(`/?deal=${encodeURIComponent(dealId)}`);
    }
  };

  const firstAlertTarget = useMemo(() => {
    const venueId = [...byVenue.keys()][0];
    if (venueId) return { venueId, dealId: null as string | null };
    const dealId = [...byDeal.keys()][0];
    if (dealId) return { venueId: null as string | null, dealId };
    return null;
  }, [byVenue, byDeal]);

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

  const shownDeals = filter === "venues" ? [] : visibleDeals;
  const shownVenues = filter === "deals" ? [] : visibleVenues;
  const visibleCount = shownDeals.length + shownVenues.length;

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
          <SignedOutPreview
            pageTitle="Favorites"
            icon={Heart}
            title="Sign in to view favorites"
            description="Create an account to save and track your favorite deals across all venues"
            actionLabel="Sign In"
            onAction={() => {
              rememberPostAuthRedirect();
              navigate("/auth");
            }}
            samples={[
              {
                title: "Rooftop happy hour",
                subtitle: "Uptown · Half-price cocktails",
                meta: "Open",
              },
              {
                title: "Late-night tacos",
                subtitle: "NoDa · 2-for-1 until 1am",
                meta: "Saved",
              },
              {
                title: "Live jazz sessions",
                subtitle: "South End · No cover before 9",
                meta: "Tonight",
              },
            ]}
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
    <PageLayout
      defaultTab="favorites"
      headerConfig={headerConfig}
      onPullToRefresh={async () => {
        await Promise.all([refetchFavorites(), fetchFavoriteDeals()]);
      }}
    >
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
            onAction={() => navigate("/deals")}
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
                  className="pr-9 h-11 placeholder:text-ellipsis placeholder:overflow-hidden placeholder:whitespace-nowrap"
                  style={{ paddingLeft: "40px" }}
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
            <div
              role="group"
              aria-label="Filter favorites by type"
              className="flex flex-wrap gap-2"
            >
              {(
                [
                  { key: "all", label: `All (${visibleDeals.length + visibleVenues.length})` },
                  { key: "venues", label: `Venues (${visibleVenues.length})` },
                  { key: "deals", label: `Deals (${visibleDeals.length})` },
                ] as const
              ).map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => setFilter(chip.key)}
                  aria-pressed={filter === chip.key}
                  className={`min-h-[44px] px-4 rounded-full border text-sm font-medium transition ${
                    filter === chip.key
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border bg-card/60 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {chip.label}
                </button>
              ))}
            </div>
            {totalUnread > 0 && firstAlertTarget && (
              <button
                type="button"
                onClick={() =>
                  openFavorite(
                    firstAlertTarget.venueId,
                    firstAlertTarget.dealId,
                  )
                }
                aria-label={`${totalUnread} new alert${totalUnread === 1 ? "" : "s"} on your favorites. Open the latest.`}
                className="w-full flex items-center gap-3 rounded-xl border border-primary/40 bg-primary/10 px-3 py-2.5 text-left hover:bg-primary/15 transition min-h-[44px]"
              >
                <span className="relative shrink-0 grid place-items-center w-9 h-9 rounded-full bg-primary/20 text-primary">
                  <Bell className="w-4 h-4" />
                  <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold grid place-items-center">
                    {totalUnread > 99 ? "99+" : totalUnread}
                  </span>
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">
                    {totalUnread} new alert{totalUnread === 1 ? "" : "s"} on
                    your favorites
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Tap to open the JetCard
                  </span>
                </span>
              </button>
            )}
            {visibleCount === 0 && (
              <EmptyState
                icon={Search}
                title="No matches"
                description={`Nothing in your favorites matches "${query.trim()}".`}
                actionLabel="Clear search"
                onAction={() => setQuery("")}
              />
            )}
            {shownDeals.length > 0 && (
              <section>
                <h2 className="text-sm uppercase tracking-wider text-muted-foreground mb-3 px-1">
                  Saved deals
                </h2>
                <VirtualGrid
                  items={shownDeals}
                  estimateSize={280}
                  className="min-h-[20svh]"
                  columns={{ mobile: 1, tablet: 2, desktop: 3 }}
                  getItemKey={(deal) => deal.id}
                  renderItem={(deal, index) => (
                    <div className="relative">
                      <DealCard deal={deal} index={index} />
                      <ShareDeepLinkButton
                        kind="deal"
                        targetId={deal.id}
                        label={deal.title}
                        referrerId={user?.id}
                        surface="deals"
                        className="absolute top-2 right-14 z-10"
                      />
                      {(byDeal.get(deal.id)?.length ||
                        (deal.venue_id &&
                          byVenue.get(deal.venue_id)?.length)) && (
                        <AlertBadgeButton
                          count={
                            (byDeal.get(deal.id)?.length ?? 0) +
                            (deal.venue_id
                              ? (byVenue.get(deal.venue_id)?.length ?? 0)
                              : 0)
                          }
                          label={deal.venue_name}
                          onClick={() => openFavorite(deal.venue_id, deal.id)}
                        />
                      )}
                    </div>
                  )}
                />
              </section>
            )}
            {shownVenues.length > 0 && (
              <section>
                <h2 className="text-sm uppercase tracking-wider text-muted-foreground mb-3 px-1">
                  Saved venues
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {shownVenues.map((f) => (
                    <FavoriteVenueCard
                      key={f.id}
                      favorite={f}
                      alertCount={
                        f.venue_id ? (byVenue.get(f.venue_id)?.length ?? 0) : 0
                      }
                      onRemove={toggleVenueFavorite}
                      onOpen={() => openFavorite(f.venue_id, f.deal_id)}
                      referrerId={user?.id}
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
  alertCount = 0,
  referrerId,
}: {
  favorite: Favorite;
  onOpen: () => void;
  onRemove: (venueId: string, dealId?: string | null) => Promise<void>;
  alertCount?: number;
  referrerId?: string | null;
}) {
  return (
    <FavoriteVenueCardInner
      favorite={favorite}
      onOpen={onOpen}
      onRemove={onRemove}
      alertCount={alertCount}
      referrerId={referrerId}
    />
  );
}

/** Unread-alerts pill overlaid on a favorite card; opens that venue's JetCard. */
function AlertBadgeButton({
  count,
  label,
  onClick,
}: {
  count: number;
  label?: string | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={`${count} new alert${count === 1 ? "" : "s"} for ${label ?? "this favorite"}. Open JetCard.`}
      className="absolute top-2 left-2 z-10 flex items-center gap-1.5 h-11 min-h-[44px] px-3 rounded-full bg-background/70 backdrop-blur-md border border-primary/40 text-primary text-xs font-semibold hover:bg-background/90 transition"
    >
      <span className="relative flex">
        <Bell className="w-4 h-4" />
        <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-primary animate-pulse" />
      </span>
      {count > 9 ? "9+" : count} new
    </button>
  );
}

function FavoriteVenueCardInner({
  favorite,
  onOpen,
  onRemove,
  alertCount = 0,
  referrerId,
}: {
  favorite: Favorite;
  onOpen: () => void;
  onRemove: (venueId: string, dealId?: string | null) => Promise<void>;
  alertCount?: number;
  referrerId?: string | null;
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
        {favorite.venue_id && (
          <ShareDeepLinkButton
            kind="venue"
            targetId={favorite.venue_id}
            label={favorite.venue_name}
            referrerId={referrerId}
            surface="favorites"
            className="absolute top-2 right-14"
          />
        )}
        {alertCount > 0 && (
          <AlertBadgeButton
            count={alertCount}
            label={favorite.venue_name}
            onClick={onOpen}
          />
        )}
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
