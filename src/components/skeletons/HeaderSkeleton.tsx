import { Skeleton } from "@/components/ui/skeleton";

export function HeaderSkeleton() {
  return (
    <header
      className="fixed top-0 left-0 right-0 z-[60]"
      style={{
        height: 'var(--header-total-height, 52px)',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        background: 'hsl(var(--card) / 0.8)',
        backdropFilter: 'blur(24px) saturate(1.6)',
        WebkitBackdropFilter: 'blur(24px) saturate(1.6)',
        borderBottom: '1px solid hsl(var(--border) / 0.4)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: '100%',
          padding: '0 clamp(12px, 2vw, 32px)',
          gap: 'clamp(8px, 1.5vw, 12px)',
        }}
      >
        {/* Logo placeholder */}
        <Skeleton style={{ height: 28, width: 56, borderRadius: 6, flexShrink: 0 }} />

        {/* Search bar placeholder — desktop only via JS media query approach using CSS */}
        <Skeleton
          className="hidden md:block"
          style={{ height: 32, flex: '1 1 auto', maxWidth: 'clamp(200px, 40vw, 480px)', borderRadius: 8 }}
        />

        {/* Search icon placeholder — mobile only */}
        <Skeleton
          className="md:hidden"
          style={{ height: 32, width: 32, borderRadius: '50%', flexShrink: 0 }}
        />

        {/* Avatar placeholder */}
        <Skeleton style={{ height: 32, width: 32, borderRadius: '50%', flexShrink: 0 }} />
      </div>
    </header>
  );
}
