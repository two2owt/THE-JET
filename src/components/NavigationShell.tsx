import { HeaderSkeleton } from "./skeletons/HeaderSkeleton";
import { BottomNavSkeleton } from "./skeletons/BottomNavSkeleton";
import { GenericPageSkeleton } from "./skeletons/PageSkeletons";

/**
 * Persistent navigation shell rendered as Suspense fallback.
 * Shows skeleton header, content placeholder, and bottom nav
 * while lazy-loaded pages are being fetched.
 */
export function NavigationShell() {
  return (
    <div
      className="relative w-full h-full"
      style={{
        flex: '1 1 0%',
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <HeaderSkeleton />

      <main
        role="main"
        style={{
          flex: '1 1 auto',
          height: 'var(--main-height, calc(100dvh - 52px - 60px))',
          minHeight: 'var(--main-height, calc(100dvh - 52px - 60px))',
          maxHeight: 'var(--main-height, calc(100dvh - 52px - 60px))',
          contain: 'strict',
          boxSizing: 'border-box',
          width: '100%',
          overflow: 'hidden',
        }}
      >
        <GenericPageSkeleton />
      </main>

      <BottomNavSkeleton />
    </div>
  );
}
