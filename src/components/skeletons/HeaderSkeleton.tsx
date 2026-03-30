import { Skeleton } from "@/components/ui/skeleton";

export function HeaderSkeleton() {
  return (
    <header
      className="fixed top-0 left-0 right-0 z-[60] bg-card/80 backdrop-blur-xl border-b border-border/40"
      style={{
        height: 'var(--header-total-height, 52px)',
        paddingTop: 'env(safe-area-inset-top, 0px)',
      }}
    >
      <div className="flex items-center justify-between h-full px-3 sm:px-4 md:px-6 lg:px-8 gap-2 sm:gap-3">
        {/* Logo placeholder */}
        <Skeleton className="h-7 w-14 rounded-md flex-shrink-0" />

        {/* Search bar placeholder - hidden on small mobile, visible on md+ */}
        <Skeleton className="hidden md:block h-8 flex-1 max-w-[clamp(200px,40vw,480px)] rounded-lg" />

        {/* Search icon placeholder on mobile */}
        <Skeleton className="md:hidden h-8 w-8 rounded-full flex-shrink-0" />

        {/* Avatar placeholder */}
        <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
      </div>
    </header>
  );
}
