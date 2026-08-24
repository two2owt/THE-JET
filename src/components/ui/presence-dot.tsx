import type { CSSProperties } from "react";
import type { PresenceStatus } from "@/hooks/usePresence";

const TOKENS: Record<PresenceStatus, { hsl: string; label: string }> = {
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
  /** Optional owner id — surfaced for e2e assertions. */
  userId?: string;
  style?: CSSProperties;
}

/**
 * Presence dot — flat saturated fill with a soft outer glow. No frosted rim or
 * ring borders, so it sits flush against avatars at any size.
 */
export function PresenceDot({
  status,
  size = 12,
  overlay = true,
  userId,
  style,
}: PresenceDotProps) {
  const { hsl, label } = TOKENS[status];
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      data-testid="presence-dot"
      data-presence-status={status}
      data-presence-user={userId}
      style={{
        position: overlay ? "absolute" : "relative",
        // Sit flat on the avatar's bottom-right edge — no negative offset so
        // nothing is clipped by rounded parents.
        bottom: overlay ? 0 : undefined,
        right: overlay ? 0 : undefined,
        width: size,
        height: size,
        borderRadius: "9999px",
        display: "inline-block",
        boxSizing: "border-box",
        background: `hsl(${hsl})`,
        border: "none",
        boxShadow: `0 0 ${Math.round(size * 0.5)}px hsl(${hsl} / 0.85), 0 0 ${Math.round(size * 1.2)}px hsl(${hsl} / 0.45)`,
        zIndex: 2,
        pointerEvents: "none",
        ...style,
      }}
    />
  );
}

