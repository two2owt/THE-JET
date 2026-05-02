import { Skeleton } from "@/components/ui/skeleton";

/**
 * Luxe skeleton placeholder for the JetCard venue panel.
 *
 * Mirrors the real card's silhouette so the swap-in feels seamless:
 *  - 80px image header with floating activity + category pill placeholders
 *  - Title + neighborhood block
 *  - Hairline gold divider
 *  - Inline metric strip
 *  - Action row
 *
 * Surfaces use the same near-black gradient + ambient gold glow as JetCard,
 * and child blocks rely on the shared `<Skeleton>` primitive (which already
 * carries the gold-tinted shimmer + reduced-motion guard).
 */
export function JetCardSkeleton() {
  return (
    <article
      aria-busy="true"
      aria-label="Loading venue details"
      style={{
        background:
          'linear-gradient(180deg, hsl(var(--card) / 0.96), hsl(var(--card) / 0.82))',
        border: '1px solid hsl(0 0% 100% / 0.06)',
        borderRadius: '16px',
        overflow: 'hidden',
        boxShadow:
          '0 0 60px hsl(var(--gold) / 0.05), 0 24px 50px -20px rgba(0,0,0,0.75), 0 0 0 1px hsl(var(--gold) / 0.18), inset 0 1px 0 hsl(0 0% 100% / 0.05)',
        maxHeight: '420px',
      }}
    >
      {/* Image header */}
      <div
        style={{
          position: 'relative',
          height: '80px',
          background:
            'linear-gradient(135deg, hsl(var(--primary) / 0.18), hsl(var(--accent) / 0.12))',
          overflow: 'hidden',
        }}
      >
        <Skeleton
          className="rounded-none"
          style={{ position: 'absolute', inset: 0, borderRadius: 0 }}
        />
        {/* Activity pill placeholder */}
        <Skeleton
          style={{
            position: 'absolute',
            top: '8px',
            left: '8px',
            width: '92px',
            height: '20px',
            borderRadius: '9999px',
          }}
        />
        {/* Category pill placeholder */}
        <Skeleton
          style={{
            position: 'absolute',
            bottom: '8px',
            left: '8px',
            width: '70px',
            height: '18px',
            borderRadius: '9999px',
          }}
        />
      </div>

      {/* Content */}
      <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {/* Title + neighborhood */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <Skeleton style={{ height: '18px', width: '70%' }} />
          <Skeleton style={{ height: '11px', width: '55%' }} />
        </div>

        {/* Gold hairline divider — matches the real card */}
        <div
          aria-hidden="true"
          style={{
            height: '1px',
            width: '100%',
            background:
              'linear-gradient(90deg, transparent, hsl(var(--gold) / 0.35) 50%, transparent)',
          }}
        />

        {/* Metric strip */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            padding: '8px 10px',
            borderRadius: '10px',
            background:
              'linear-gradient(180deg, rgba(0,0,0,0.35), rgba(0,0,0,0.18))',
            border: '1px solid hsl(0 0% 100% / 0.05)',
            boxShadow:
              'inset 0 1px 0 hsl(0 0% 100% / 0.04), 0 0 24px hsl(var(--gold) / 0.04)',
          }}
        >
          <Skeleton style={{ height: '12px', width: '60px' }} />
          <div aria-hidden="true" style={{ width: '1px', height: '14px', background: 'hsl(var(--silver) / 0.18)' }} />
          <Skeleton style={{ height: '12px', width: '40px' }} />
          <div aria-hidden="true" style={{ width: '1px', height: '14px', background: 'hsl(var(--silver) / 0.18)' }} />
          <Skeleton style={{ height: '12px', width: '50px' }} />
        </div>

        {/* Action row */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <Skeleton style={{ flex: 1, height: '36px', borderRadius: '10px' }} />
          <Skeleton style={{ width: '36px', height: '36px', borderRadius: '10px' }} />
          <Skeleton style={{ width: '36px', height: '36px', borderRadius: '10px' }} />
        </div>

        {/* Parking section placeholder */}
        <div
          style={{
            borderTop: '1px solid hsl(var(--border) / 0.5)',
            paddingTop: '8px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          <Skeleton style={{ height: '10px', width: '90px' }} />
          <Skeleton style={{ height: '40px', borderRadius: '8px' }} />
        </div>
      </div>
    </article>
  );
}

/**
 * Compact luxe skeleton for the parking row inside JetCard while
 * `get-nearby-parking` resolves. Two stacked rows mimic the real list.
 */
export function JetCardParkingSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }} aria-busy="true" aria-label="Loading nearby parking">
      {[0, 1].map((i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 8px',
            borderRadius: '8px',
            background: 'hsl(var(--secondary) / 0.4)',
            border: '1px solid hsl(var(--border) / 0.3)',
          }}
        >
          <Skeleton style={{ width: '28px', height: '28px', borderRadius: '6px', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <Skeleton style={{ height: '11px', width: '70%' }} />
            <Skeleton style={{ height: '9px', width: '50%' }} />
          </div>
          <Skeleton style={{ width: '14px', height: '14px', borderRadius: '4px', flexShrink: 0 }} />
        </div>
      ))}
    </div>
  );
}