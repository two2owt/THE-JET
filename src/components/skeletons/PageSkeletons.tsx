import { Skeleton } from "@/components/ui/skeleton";
import { PageShell } from "@/components/PageShell";

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
    <div className="w-full">
      <PageHeadingSkeleton subtitleWidth="w-20" />
      <CardGridSkeleton count={6} />
    </div>
  );
}

/* ─── Social Page ─── */

export function SocialPageSkeleton() {
  return (
    <div className="w-full">
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

/* ─── Admin Dashboard Page ─── */

export function AdminPageSkeleton() {
  return (
    <PageShell>
      {/* Title + subtitle — mirrors <TabPageHeader> exactly for 0 CLS */}
      <div>
        <Skeleton className="h-8 w-56 rounded-lg" style={{ marginBottom: 6 }} />
        <Skeleton className="h-4 w-72 rounded" />
      </div>
      {/* Tabs trigger row — 4 equal segments matching real grid-cols-4 */}
      <div className="grid w-full grid-cols-4 gap-1 rounded-xl border-hairline bg-card/40 backdrop-blur-xl p-1">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-9 rounded-lg" />
        ))}
      </div>
      {/* Active tab content — toolbar + responsive card grid */}
      <Skeleton className="h-10 w-full sm:w-72 rounded-full" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-40 sm:h-48 w-full rounded-2xl" />
        ))}
      </div>
    </PageShell>
  );
}

/* ─── Profile Page ─── */

export function ProfilePageSkeleton() {
  return (
    <PageShell>
      {/* Header — title + subtitle mirror real <TabPageHeader> */}
      <div>
        <Skeleton className="h-8 w-40 rounded-lg" style={{ marginBottom: 6 }} />
        <Skeleton className="h-4 w-72 rounded" />
      </div>

      {/* Identity hero — matches real centered hero card (rounded-2xl,
          border-hairline, bg-card/40 backdrop-blur-xl, glow-ambient). */}
      <section
        className="relative rounded-2xl border-hairline bg-card/40 backdrop-blur-xl p-fluid-md sm:p-fluid-lg overflow-hidden"
      >
        <div className="flex flex-col items-center text-center">
          {/* Avatar — exact 104px ring matches real Avatar */}
          <Skeleton
            className="rounded-full ring-2 ring-primary/40"
            style={{ width: 104, height: 104 }}
          />
          {/* Display name */}
          <Skeleton className="mt-fluid-md h-7 w-48 rounded" />
          {/* Pronouns chip */}
          <Skeleton className="mt-1 h-4 w-20 rounded-full" />
          {/* Email row */}
          <Skeleton className="mt-2 h-4 w-56 max-w-full rounded" />
          {/* Edit pill */}
          <Skeleton
            className="h-9 w-28 rounded-full"
            style={{ marginTop: 'max(16px, var(--space-lg))' }}
          />
        </div>

        {/* Divider — mirrors .divider-luxe */}
        <div className="my-fluid-md h-px w-full bg-border/40" />

        {/* Stat chips — 3 equal columns matching .profile-stats-grid */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="min-w-0 flex flex-col items-center justify-center rounded-xl border-hairline bg-card/30 backdrop-blur-sm py-3 px-2 gap-1.5"
            >
              <Skeleton className="w-4 h-4 rounded" />
              <Skeleton className="h-6 w-8 rounded" />
              <Skeleton className="h-3 w-14 rounded" />
            </div>
          ))}
        </div>
      </section>

      {/* Account Details form card */}
      <section className="rounded-2xl border-hairline bg-card/40 backdrop-blur-xl p-fluid-md sm:p-fluid-lg">
        <div className="mb-fluid-md flex items-center gap-2">
          <Skeleton className="w-2 h-2 rounded-full" />
          <Skeleton className="h-3 w-32 rounded" />
        </div>
        <div className="flex flex-col" style={{ gap: 'var(--space-sm)' }}>
          <div className="flex flex-col" style={{ gap: 'var(--space-xs)' }}>
            <Skeleton className="h-3 w-28 rounded" />
            <Skeleton className="h-10 w-full rounded-md" />
          </div>
          <div className="flex flex-col" style={{ gap: 'var(--space-xs)' }}>
            <Skeleton className="h-3 w-16 rounded" />
            <Skeleton className="h-24 w-full rounded-md" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Skeleton className="h-10 w-full rounded-md" />
            <Skeleton className="h-10 w-full rounded-md" />
          </div>
        </div>
      </section>

      {/* Sign Out card */}
      <section className="rounded-2xl border-hairline border-destructive/20 bg-card/40 backdrop-blur-xl p-fluid-sm sm:p-fluid-md">
        <Skeleton className="h-10 w-full rounded-full" />
      </section>
    </PageShell>
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
