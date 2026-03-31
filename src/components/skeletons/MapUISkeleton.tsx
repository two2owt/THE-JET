import { Skeleton } from "@/components/ui/skeleton";

/**
 * Skeleton placeholders for map UI controls that appear during map initialization.
 * Mirrors the exact positions and sizes of the real controls:
 * - Top-left: city selector + map style button
 * - Bottom-right: layers FAB
 * - Bottom-left: activity legend
 */
export function MapUISkeleton() {
  return (
    <>
      {/* Top-left controls: City selector + Style button */}
      <div
        className="absolute flex items-center"
        style={{
          top: 'var(--map-ui-inset-top, 0.75rem)',
          left: 'var(--map-ui-inset-left, 0.75rem)',
          gap: 'clamp(4px, 0.8vw, 8px)',
          zIndex: 30,
        }}
      >
        {/* City selector skeleton */}
        <Skeleton
          className="rounded-xl"
          style={{
            height: 'clamp(32px, 5vw, 40px)',
            width: 'clamp(120px, 18vw, 220px)',
          }}
        />
        {/* Style button skeleton */}
        <Skeleton
          className="rounded-xl"
          style={{
            width: 'clamp(32px, 5vw, 40px)',
            height: 'clamp(32px, 5vw, 40px)',
          }}
        />
      </div>

      {/* Bottom-right: Layers FAB skeleton */}
      <div
        className="absolute"
        style={{
          bottom: 'var(--map-ui-inset-bottom, 0.75rem)',
          right: 'var(--map-ui-inset-right, 0.75rem)',
          zIndex: 30,
        }}
      >
        <Skeleton
          className="rounded-xl"
          style={{
            width: 'var(--touch-target-min, 44px)',
            height: 'var(--touch-target-min, 44px)',
          }}
        />
      </div>

      {/* Bottom-left: Legend skeleton */}
      <div
        className="absolute"
        style={{
          bottom: 'var(--map-fixed-bottom, 0.75rem)',
          left: 'var(--map-ui-inset-left, 0.75rem)',
          zIndex: 30,
        }}
      >
        <Skeleton
          className="rounded-xl"
          style={{
            width: 'clamp(100px, 20vw, 180px)',
            height: 'clamp(40px, 6vw, 56px)',
          }}
        />
      </div>
    </>
  );
}
