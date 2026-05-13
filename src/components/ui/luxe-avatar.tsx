import * as React from "react";
import { Send } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

/**
 * Luxe Gradient Avatar — unified user avatar treatment used app-wide.
 *
 * Visual layers (outside → in):
 *   1. Brand gradient ring (JET red → purple → gold) with optional active glow
 *   2. Dark gap to separate ring from inner content (depth)
 *   3. Silver inset rim (turns subtle gold on hover via `group-hover` if a
 *      parent uses `group`)
 *   4. Avatar image OR paper-plane fallback (for users without an uploaded
 *      photo / unauthenticated visitors)
 *   5. Optional emerald presence dot with ping pulse (online indicator)
 *
 * Uses semantic `--background` for the dark gap so it adapts to theme,
 * and the brand color hexes from the design system memory.
 */

type Size = "xs" | "sm" | "md" | "lg" | "xl" | "2xl";

const SIZE_CLASS: Record<Size, string> = {
  xs: "w-7 h-7",
  sm: "w-9 h-9",
  md: "w-11 h-11",
  lg: "w-16 h-16",
  xl: "w-24 h-24",
  "2xl": "w-28 h-28",
};


export interface LuxeAvatarProps {
  src?: string | null;
  alt?: string;
  /** Initials shown if image fails AND `forceIconFallback` is false. */
  initials?: string;
  /** When true, always render the paper-plane icon as fallback (new / unauth users). */
  forceIconFallback?: boolean;
  /** Predefined size bucket. Omit to size purely via `className`. */
  size?: Size;
  /** Show pulsing online indicator dot. */
  showPresence?: boolean;
  /** Apply a stronger glow to indicate an active/selected state. */
  active?: boolean;
  className?: string;
  /** Forwarded onClick — turns the wrapper into a focusable button. */
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  /** Aria-label for icon-only / button modes. */
  "aria-label"?: string;
}

export const LuxeAvatar = React.forwardRef<HTMLDivElement, LuxeAvatarProps>(
  (
    {
      src,
      alt = "",
      initials,
      forceIconFallback = false,
      size = "md",
      showPresence = false,
      active = false,
      className,
      onClick,
      ...rest
    },
    ref,
  ) => {
    const showIcon = forceIconFallback || !src;
    const sizeClass = size ? SIZE_CLASS[size] : "";

    return (
      <div
        ref={ref}
        onClick={onClick}
        role={onClick ? "button" : undefined}
        tabIndex={onClick ? 0 : undefined}
        aria-label={rest["aria-label"]}
        className={cn(
          "luxe-avatar relative inline-block flex-shrink-0 rounded-full",
          sizeClass,
          onClick && "cursor-pointer",
          className,
        )}
        style={{
          padding: "2px",
          background:
            "linear-gradient(135deg, #FF2D55 0%, #8E2DE2 55%, #C9A961 100%)",
          boxShadow: active
            ? "0 0 0 1px hsl(var(--background)), 0 0 22px rgba(142,45,226,0.55), 0 4px 18px rgba(255,45,85,0.35)"
            : "0 0 0 1px hsl(var(--background) / 0.7), 0 4px 14px rgba(0,0,0,0.45)",
          transition: "box-shadow 0.4s ease, transform 0.3s ease",
        }}
      >
        {/* Dark gap layer */}
        <div
          className="w-full h-full rounded-full"
          style={{ background: "hsl(var(--background))", padding: "1.5px" }}
        >
          {/* Silver inset rim + content surface */}
          <Avatar
            className="w-full h-full"
            style={{
              background: "#1A1A1A",
              boxShadow: "inset 0 0 0 1px rgba(156,163,175,0.22)",
            }}
          >
            {!showIcon && <AvatarImage src={src || ""} alt={alt} />}
            <AvatarFallback
              className="text-primary-foreground font-semibold tracking-wide"
              style={{
                background:
                  "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)))",
              }}
            >
              {showIcon ? (
                <Send
                  // Scales relative to the avatar container (cqw via container queries).
                  aria-hidden="true"
                  // The paper-plane silhouette — brand fallback for users
                  // without an uploaded avatar.
                  style={{ width: "44%", height: "44%" }}
                  className="-translate-x-[2%] translate-y-[2%]"
                />
              ) : (
                (initials || "").substring(0, 2).toUpperCase()
              )}
            </AvatarFallback>
          </Avatar>
        </div>

        {showPresence && (
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              bottom: 0,
              right: 0,
              width: "30%",
              height: "30%",
              minWidth: 12,
              minHeight: 12,
              maxWidth: 16,
              maxHeight: 16,
              borderRadius: "9999px",
              background: "hsl(var(--background))",
              display: "grid",
              placeItems: "center",
            }}
          >
            <span
              style={{
                position: "relative",
                width: "65%",
                height: "65%",
                borderRadius: "9999px",
                background: "#10B981",
                boxShadow: "0 0 8px rgba(16,185,129,0.8)",
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: "9999px",
                  background: "#10B981",
                  opacity: 0.3,
                  animation:
                    "ping 1.6s cubic-bezier(0,0,0.2,1) infinite",
                }}
              />
            </span>
          </span>
        )}
      </div>
    );
  },
);

LuxeAvatar.displayName = "LuxeAvatar";