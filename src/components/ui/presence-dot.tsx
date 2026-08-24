import type { CSSProperties } from "react";
import type { PresenceStatus } from "@/hooks/usePresence";

const TOKENS: Record<
  PresenceStatus,
  { hsl: string; label: string }
> = {
  active: { hsl: "142 84% 50%", label: "Active now" },
  recent: { hsl: "45 96% 55%", label: "Recently active" },
  away: { hsl: "0 84% 58%", label: "Inactive" },
};

export interface PresenceDotProps {
  status: PresenceStatus;
  /** Diameter in px. Defaults to a 12px badge that reads well at 40–52px avatars. */
  size?: number;
  /** Absolutely position the dot over the bottom-right of a relative parent. */
  overlay?: boolean;
  style?: CSSProperties;
}

/**
 * Glassmorphic presence dot — frosted core, saturated inner fill and a soft
 * outer glow so it stays legible over photos, maps and dark surfaces.
 */
export function PresenceDot({
  status,
  size = 12,
  overlay = true,
  style,
}: PresenceDotProps) {
  const { hsl, label } = TOKENS[status];
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      style={{
        position: overlay ? "absolute" : "relative",
        // Offset slightly outside the avatar edge for maximum visibility.
        bottom: overlay ? -1 : undefined,
        right: overlay ? -1 : undefined,
        width: size,
        height: size,
        borderRadius: "9999px",
        display: "inline-block",
        boxSizing: "border-box",
        background: `radial-gradient(circle at 32% 28%, hsl(0 0% 100% / 0.55), hsl(${hsl} / 0.95) 62%)`,
        border: `1.5px solid hsl(var(--background) / 0.9)`,
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        boxShadow: `0 0 0 1px hsl(${hsl} / 0.5), 0 0 ${size}px hsl(${hsl} / 0.75), inset 0 0 ${Math.round(size / 2)}px hsl(0 0% 100% / 0.25)`,
        zIndex: 2,
        pointerEvents: "none",
        ...style,
      }}
    />
  );
}
