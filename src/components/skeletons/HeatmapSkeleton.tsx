import { MapPin } from "lucide-react";
import { MapUISkeleton } from "./MapUISkeleton";

/**
 * Luxe full-surface skeleton for the Mapbox heatmap while the GL module
 * loads, the style boots, and tiles stream in.
 *
 * Visual language matches the rest of the dark-luxe system:
 *  - Near-black radial vignette ground (no harsh flat fill)
 *  - Faint gold concentric "radar" rings hinting at activity density
 *  - Soft gold-tinted shimmer sweeping diagonally (GPU transform/opacity only)
 *  - Centered MapPin halo in JET primary, ringed by a gold hairline
 *  - Reuses MapUISkeleton so the floating controls also have placeholders
 *
 * The container is positioned by the caller (absolute inset-0). Opacity
 * fade-out is also driven by the caller.
 */
export function HeatmapSkeleton({ translucent = false }: { translucent?: boolean }) {
  return (
    <div
      aria-busy="true"
      aria-label="Loading map"
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        // Layered ground: deep-black radial + subtle vertical gradient.
        // When translucent the underlying map can bleed through softly.
        background: translucent
          ? 'radial-gradient(ellipse at 50% 40%, hsl(var(--background) / 0.55) 0%, hsl(var(--background) / 0.78) 60%, hsl(var(--background) / 0.88) 100%)'
          : 'radial-gradient(ellipse at 50% 40%, hsl(var(--card) / 0.95) 0%, hsl(var(--background)) 70%)',
      }}
    >
      {/* Concentric gold radar rings — hint at heatmap density without flashing color */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          background: `
            radial-gradient(circle at 50% 50%, transparent 60px, hsl(var(--gold) / 0.06) 61px, transparent 63px),
            radial-gradient(circle at 50% 50%, transparent 110px, hsl(var(--gold) / 0.05) 111px, transparent 113px),
            radial-gradient(circle at 50% 50%, transparent 170px, hsl(var(--gold) / 0.04) 171px, transparent 173px),
            radial-gradient(circle at 50% 50%, transparent 240px, hsl(var(--gold) / 0.03) 241px, transparent 243px)
          `,
        }}
      />

      {/* Diagonal shimmer sweep — pure transform/opacity for 0 CLS */}
      <div
        aria-hidden="true"
        className="heatmap-skeleton-shimmer"
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background:
            'linear-gradient(110deg, transparent 35%, hsl(var(--gold) / 0.05) 48%, hsl(0 0% 100% / 0.04) 50%, hsl(var(--gold) / 0.05) 52%, transparent 65%)',
          mixBlendMode: 'screen',
        }}
      />

      {/* Centered luxe pin halo */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ position: 'relative', width: '56px', height: '56px' }}>
          {/* Ambient gold ring pulse */}
          <div
            className="rounded-full animate-ping"
            style={{
              position: 'absolute',
              inset: 0,
              border: '1px solid hsl(var(--gold) / 0.45)',
              boxShadow: '0 0 28px hsl(var(--gold) / 0.18)',
              animationDuration: '1.8s',
            }}
          />
          {/* Solid disc — JET primary glow with gold hairline */}
          <div
            className="rounded-full"
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background:
                'radial-gradient(circle, hsl(var(--primary) / 0.22), hsl(var(--primary) / 0.06) 70%, transparent)',
              border: '1px solid hsl(var(--gold) / 0.35)',
              boxShadow:
                '0 0 30px hsl(var(--primary) / 0.25), inset 0 1px 0 hsl(0 0% 100% / 0.06)',
            }}
          >
            <MapPin
              style={{
                width: '22px',
                height: '22px',
                color: 'hsl(var(--primary))',
                filter: 'drop-shadow(0 0 6px hsl(var(--gold) / 0.45))',
              }}
            />
          </div>
        </div>
      </div>

      {/* Map UI control placeholders */}
      <MapUISkeleton />
    </div>
  );
}