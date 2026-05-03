import { Skeleton } from "@/components/ui/skeleton";

/* ─── Shared helpers ─── */

function PageHeadingSkeleton({ subtitleWidth = "w-24" }: { subtitleWidth?: string }) {
  return (
    <div className="mb-fluid-lg">
      <Skeleton className="h-8 w-48 rounded-lg mb-fluid-xs" />
      <Skeleton className={`h-4 ${subtitleWidth} rounded`} />
    </div>
  );
}

function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-56 rounded-2xl" />
      ))}
    </div>
  );
}

/* ─── Favorites Page ─── */

export function FavoritesPageSkeleton() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 lg:px-10 py-fluid-lg">
      <PageHeadingSkeleton subtitleWidth="w-20" />
      <CardGridSkeleton count={6} />
    </div>
  );
}

/* ─── Social Page ─── */

export function SocialPageSkeleton() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 lg:px-10 py-fluid-lg">
      {/* Messages button */}
      <Skeleton className="h-12 w-full rounded-xl mb-6" />

      {/* Section: Friend Requests */}
      <Skeleton className="h-6 w-36 rounded mb-3" />
      <div className="flex gap-3 mb-8">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>

      {/* Section: My Friends */}
      <Skeleton className="h-6 w-28 rounded mb-3" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>

      {/* Section: Discover */}
      <Skeleton className="h-6 w-36 rounded mb-3 mt-8" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

/* ─── Notifications Tab ─── */

export function NotificationsTabSkeleton() {
  return (
    <div className="p-4 flex flex-col gap-4">
      <div>
        <Skeleton className="h-8 w-40 rounded-lg mb-1.5" />
        <Skeleton className="h-4 w-64 rounded" />
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-24 rounded-2xl" />
      ))}
    </div>
  );
}

/* ─── Explore Tab ─── */

export function ExploreTabSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-8 w-44 rounded-lg" />
      {/* Search bar */}
      <Skeleton className="h-10 w-full rounded-lg" />
      {/* Category pills */}
      <div className="flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-20 rounded-full flex-shrink-0" />
        ))}
      </div>
      {/* Deal cards */}
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-32 rounded-2xl" />
      ))}
    </div>
  );
}

/* ─── Messages Page ─── */

export function MessagesPageSkeleton() {
  return (
    <div className="max-w-2xl mx-auto w-full flex flex-col">
      <div className="px-4 py-3 border-b border-border/60">
        <Skeleton className="h-8 w-32 rounded-lg" />
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="h-12 w-12 rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32 rounded" />
              <Skeleton className="h-3 w-48 rounded" />
            </div>
            <Skeleton className="h-3 w-10 rounded flex-shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Settings Page ─── */

export function SettingsPageSkeleton() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 lg:px-10 py-fluid-lg space-y-6">
      <PageHeadingSkeleton subtitleWidth="w-40" />
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-40 rounded-2xl" />
      ))}
    </div>
  );
}

/* ─── Profile Page ─── */

export function ProfilePageSkeleton() {
  return (
    <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 md:px-8 lg:px-10 py-fluid-lg space-y-6">
      {/* Hero card mirrors real Profile layout to prevent CLS */}
      <div className="overflow-hidden rounded-2xl border border-border/40 bg-card/90 backdrop-blur-xl shadow-card">
        {/* Banner */}
        <Skeleton className="h-28 sm:h-32 w-full rounded-none" />

        <div className="px-5 sm:px-7 pb-6">
          {/* Overlapping avatar + identity */}
          <div className="flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-5 -mt-12 sm:-mt-14">
            <Skeleton className="w-24 h-24 sm:w-28 sm:h-28 rounded-full mx-auto sm:mx-0 ring-4 ring-card shrink-0" />
            <div className="flex-1 min-w-0 text-center sm:text-left sm:pb-1 space-y-2">
              <Skeleton className="h-7 w-44 sm:w-56 rounded mx-auto sm:mx-0" />
              <Skeleton className="h-4 w-56 sm:w-64 rounded mx-auto sm:mx-0" />
            </div>
          </div>

          {/* Stat chips — match real grid for 0 CLS */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3 mt-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="min-w-0 flex flex-col items-center justify-center rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm py-3 px-2 gap-1.5"
              >
                <Skeleton className="w-4 h-4 rounded" />
                <Skeleton className="h-6 w-8 rounded" />
                <Skeleton className="h-3 w-14 rounded" />
              </div>
            ))}
          </div>

          {/* Separator */}
          <div className="h-px w-full bg-border/60 my-6" />

          {/* Form fields */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Skeleton className="h-4 w-28 rounded" />
              <Skeleton className="h-10 w-full rounded-md" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-12 rounded" />
              <Skeleton className="h-24 w-full rounded-md" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Skeleton className="h-4 w-20 rounded" />
                <Skeleton className="h-10 w-full rounded-md" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-20 rounded" />
                <Skeleton className="h-10 w-full rounded-md" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Secondary cards */}
      {Array.from({ length: 2 }).map((_, i) => (
        <Skeleton key={i} className="h-32 w-full rounded-2xl" />
      ))}
    </div>
  );
}

/* ─── Generic page skeleton (for NavigationShell fallback) ─── */

export function GenericPageSkeleton() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 lg:px-10 py-fluid-lg">
      <PageHeadingSkeleton />
      <CardGridSkeleton count={6} />
    </div>
  );
}
