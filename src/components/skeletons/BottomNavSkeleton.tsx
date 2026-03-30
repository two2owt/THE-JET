import { Skeleton } from "@/components/ui/skeleton";

export function BottomNavSkeleton() {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-card/80 backdrop-blur-xl border-t border-border/40"
      style={{
        height: 'var(--bottom-nav-total-height, 60px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div className="flex items-center justify-around h-full max-w-lg sm:max-w-2xl md:max-w-3xl lg:max-w-4xl mx-auto px-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-2.5 w-8 rounded-full" />
          </div>
        ))}
      </div>
    </nav>
  );
}
