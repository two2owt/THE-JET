import { cn } from "@/lib/utils";

/**
 * Dark luxe skeleton primitive.
 *
 * Replaces a flat muted block with a layered surface:
 *  - Hairline 5% white border (matches Card / Input)
 *  - Subtle vertical gradient on the near-black surface
 *  - Faint gold ambient glow so loading states feel premium, not dead
 *  - Diagonal shimmer sweep via the .skeleton-luxe utility (defined in
 *    index.css) so the shine itself is GPU-only `transform`/`opacity`.
 *
 * `animate-pulse` is kept as a graceful fallback for browsers/users that
 * don't run the shimmer (e.g. prefers-reduced-motion strips it).
 */
function Skeleton({ className, style, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("skeleton-luxe animate-pulse rounded-md", className)}
      style={{
        position: 'relative',
        overflow: 'hidden',
        background:
          'linear-gradient(180deg, hsl(var(--card) / 0.85), hsl(var(--card) / 0.65))',
        border: '1px solid hsl(0 0% 100% / 0.05)',
        boxShadow:
          '0 0 30px hsl(var(--gold) / 0.03), inset 0 1px 0 hsl(0 0% 100% / 0.03)',
        ...style,
      }}
      {...props}
    />
  );
}

export { Skeleton };
