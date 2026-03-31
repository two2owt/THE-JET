import { Skeleton } from "@/components/ui/skeleton";

export function BottomNavSkeleton() {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50"
      style={{
        height: 'var(--bottom-nav-total-height, 60px)',
        paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 4px)',
        paddingLeft: 'var(--safe-area-inset-left)',
        paddingRight: 'var(--safe-area-inset-right)',
        background: 'hsl(var(--card) / 0.8)',
        backdropFilter: 'blur(24px) saturate(1.6)',
        WebkitBackdropFilter: 'blur(24px) saturate(1.6)',
        borderTop: '1px solid hsl(var(--border) / 0.4)',
        contain: 'layout style',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-around',
          height: '100%',
          maxWidth: 'clamp(320px, 60vw, 560px)',
          margin: '0 auto',
          padding: '0 clamp(8px, 1.5vw, 16px)',
        }}
      >
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
              minWidth: 'clamp(48px, 12vw, 64px)',
            }}
          >
            <Skeleton style={{ height: 20, width: 20, borderRadius: 4 }} />
            <Skeleton style={{ height: 10, width: 32, borderRadius: 9999 }} />
          </div>
        ))}
      </div>
    </nav>
  );
}
