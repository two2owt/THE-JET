import { Skeleton } from "@/components/ui/skeleton";

export function PWAInstallSkeleton() {
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-4 pb-[calc(var(--safe-area-inset-bottom,0px)+1rem)]">
      <div className="max-w-md mx-auto bg-card/98 backdrop-blur-2xl border border-border/60 rounded-2xl shadow-2xl overflow-hidden">
        {/* Swipe indicator */}
        <div className="flex justify-center pt-2 pb-1">
          <Skeleton className="w-10 h-1 rounded-full" />
        </div>
        {/* Gradient accent */}
        <Skeleton className="h-1 w-full rounded-none" />

        <div className="p-4">
          {/* App info row */}
          <div className="flex items-center gap-3 mb-4">
            <Skeleton className="w-14 h-14 rounded-xl flex-shrink-0" />
            <div className="flex-1 min-w-0 space-y-2">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-3.5 w-40" />
            </div>
            <Skeleton className="w-9 h-9 rounded-full flex-shrink-0" />
          </div>

          {/* Benefits grid */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 rounded-lg" />
            ))}
          </div>

          {/* Buttons */}
          <div className="flex gap-2">
            <Skeleton className="h-9 flex-1 rounded-md" />
            <Skeleton className="h-9 flex-1 rounded-md" />
          </div>
        </div>
      </div>
    </div>
  );
}
