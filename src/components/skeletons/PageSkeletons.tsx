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

/**
 * Rows-only conversation skeleton. Mirrors the real conversation row box model
 * (same avatar size, same clamp() padding/gap) so swapping skeleton → data
 * costs 0 CLS. Used inside <ConversationList>, which already renders the page
 * header — rendering the full MessagesPageSkeleton there duplicated the header
 * row and produced a visible shift when loading finished.
 */
export function ConversationRowsSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="divide-y divide-border" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center"
          style={{
            gap: 'clamp(10px, 3vw, 14px)',
            padding: 'clamp(10px, 2.8vw, 14px) clamp(12px, 3.2vw, 16px)',
            // Real rows measure 48px of content (name + preview line) inside the
            // same clamped padding — pin it so skeleton → data is pixel-stable.
            height: 'calc(48px + clamp(10px, 2.8vw, 14px) * 2)',
            boxSizing: 'content-box',
          }}
        >
          <Skeleton className="h-11 w-11 sm:h-12 sm:w-12 lg:h-[52px] lg:w-[52px] rounded-full shrink-0" />
          <div className="flex-1 min-w-0">
            <Skeleton className="h-[18px] w-32 rounded" />
            <Skeleton className="h-[15px] w-48 max-w-full rounded" style={{ marginTop: 4 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Card-row skeleton matching the Social page list rows (same padding, radius
 * and avatar sizing) so friend / discover lists reserve their space while the
 * connection and profile queries are still in flight.
 */
export function SocialListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }} aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'clamp(10px, 3vw, 14px)',
            padding: 'clamp(10px, 2.8vw, 14px) clamp(12px, 3.2vw, 16px)',
            borderRadius: '14px',
            backgroundColor: 'hsl(var(--card) / 0.9)',
            border: '1px solid hsl(var(--border) / 0.6)',
          }}
        >
          <Skeleton className="w-10 h-10 min-[360px]:w-11 min-[360px]:h-11 sm:w-12 sm:h-12 lg:w-[52px] lg:h-[52px] rounded-full shrink-0" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Skeleton className="h-[19px] w-28 rounded" />
            <Skeleton className="h-[17px] w-40 max-w-full rounded" style={{ marginTop: 2 }} />
          </div>
          <Skeleton className="h-10 w-10 rounded-[10px] shrink-0" />
        </div>
      ))}
    </div>
  );
}

export function MessagesPageSkeleton() {
  return (
    <div className="max-w-2xl mx-auto w-full flex flex-col">
      <div className="px-4 py-3 border-b border-border/60">
        <Skeleton className="h-8 w-32 rounded-lg" />
      </div>
      {/* Reuses the exact conversation row metrics so the route-level fallback
          hands off to the live list without a reflow. */}
      <ConversationRowsSkeleton />
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
