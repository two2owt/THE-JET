import * as React from "react";
import { Send } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * PolaroidAvatar — instant-photo treatment of a user avatar.
 *
 * Layout (top → bottom):
 *   • Thin frame (top + sides), thicker bottom strip (classic Polaroid).
 *   • Square photo area with the user's image (or paper-plane fallback).
 *   • Optional caption printed on the bottom strip in a handwritten font.
 *
 * Interaction:
 *   • At rest: perfectly upright. No tilt → no layout shift.
 *   • On hover/focus: subtle ±2° tilt + lift, GPU-only (transform).
 *
 * This is a deliberate sibling to `LuxeAvatar` (which is locked circular by
 * regression tests). Use `PolaroidAvatar` only where the Polaroid look is
 * desired — Profile cards, Social cards, etc.
 */

type Size = "xs" | "sm" | "md" | "lg" | "xl";

/**
 * Each size is a `clamp(min, preferred, max)` so the polaroid scales with
 * viewport width but never overflows its `max-width`. The whole component
 * is built on em units anchored to this width, so frame padding, caption
 * text and the bottom strip all scale together.
 */
const SIZE_WIDTH: Record<Size, string> = {
  xs: "clamp(44px, 12vw, 56px)",
  sm: "clamp(64px, 16vw, 84px)",
  md: "clamp(88px, 22vw, 112px)",
  lg: "clamp(112px, 30vw, 160px)",
  xl: "clamp(144px, 38vw, 220px)",
};

export interface PolaroidAvatarProps {
  src?: string | null;
  alt?: string;
  /** Caption printed on the bottom strip. */
  caption?: string;
  /** Force the paper-plane fallback (no photo / unauth). */
  forceIconFallback?: boolean;
  size?: Size;
  /** Direction of the hover tilt. Defaults to a gentle right lean. */
  tiltDirection?: "left" | "right";
  className?: string;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  "aria-label"?: string;
}

export const PolaroidAvatar = React.forwardRef<
  HTMLDivElement,
  PolaroidAvatarProps
>(
  (
    {
      src,
      alt = "",
      caption,
      forceIconFallback = false,
      size = "md",
      tiltDirection = "right",
      className,
      onClick,
      ...rest
    },
    ref,
  ) => {
    const showIcon = forceIconFallback || !src;
    const tiltDeg = tiltDirection === "left" ? -2 : 2;
    // Anchor the entire frame to the polaroid's width via font-size.
    // This makes padding (em), caption (em) and bottom strip (em) all
    // scale linearly with the responsive width — so the same component
    // adapts cleanly across phone, tablet and desktop without ever
    // overflowing its parent.
    const widthExpr = SIZE_WIDTH[size];

    return (
      <div
        ref={ref}
        onClick={onClick}
        role={onClick ? "button" : undefined}
        tabIndex={onClick ? 0 : undefined}
        aria-label={rest["aria-label"]}
        className={cn(
          "polaroid-avatar group/polaroid relative inline-block flex-shrink-0 max-w-full",
          "transition-transform duration-300 ease-out will-change-transform",
          "hover:-translate-y-0.5 focus-visible:-translate-y-0.5",
          onClick && "cursor-pointer",
          className,
        )}
        style={{
          // Width drives every other dimension via em units.
          width: widthExpr,
          fontSize: widthExpr,
          // Hover tilt is composited (transform only) → 0 CLS.
          transform: "rotate(0deg)",
          // 7% frame on three sides, 22% bottom strip — relative to width.
          padding: "0.07em 0.07em 0.22em",
          background:
            "linear-gradient(180deg, #FAFAF7 0%, #F2EFE7 100%)",
          borderRadius: "0.04em",
          boxShadow:
            "0 1px 0 rgba(255,255,255,0.6) inset, 0 0.12em 0.28em -0.1em rgba(0,0,0,0.55), 0 0.04em 0.1em -0.04em rgba(0,0,0,0.45)",
          ["--polaroid-tilt" as string]: `${tiltDeg}deg`,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = `rotate(var(--polaroid-tilt)) translateY(-2px)`;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "rotate(0deg)";
        }}
        onFocus={(e) => {
          e.currentTarget.style.transform = `rotate(var(--polaroid-tilt)) translateY(-2px)`;
        }}
        onBlur={(e) => {
          e.currentTarget.style.transform = "rotate(0deg)";
        }}
      >
        {/* Square photo — width:100% of frame, aspect-square locks height. */}
        <div
          className="relative overflow-hidden w-full aspect-square"
          style={{
            aspectRatio: "1 / 1",
            background:
              "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)))",
            boxShadow:
              "inset 0 0 0 1px rgba(0,0,0,0.18), inset 0 8px 16px rgba(0,0,0,0.25)",
          }}
        >
          {!showIcon && (
            <img
              src={src || ""}
              alt={alt}
              className="absolute inset-0 w-full h-full object-cover block"
              draggable={false}
              loading="lazy"
              decoding="async"
            />
          )}
          {showIcon && (
            <div className="absolute inset-0 grid place-items-center text-primary-foreground">
              <Send
                aria-hidden="true"
                style={{ width: "44%", height: "44%" }}
                className="-translate-x-[2%] translate-y-[2%]"
              />
            </div>
          )}
          {/* Subtle vignette to mimic instant-film exposure */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(120% 90% at 50% 30%, transparent 55%, rgba(0,0,0,0.28) 100%)",
            }}
          />
        </div>

        {/* Bottom strip caption */}
        {caption && (
          <div
            className="absolute left-0 right-0 text-center truncate"
            style={{
              bottom: "0.04em",
              paddingLeft: "0.06em",
              paddingRight: "0.06em",
              color: "#1A1A1A",
              fontFamily:
                "'Caveat', 'Patrick Hand', 'Segoe Script', cursive",
              fontSize: "0.14em",
              lineHeight: 1,
              letterSpacing: "0.01em",
            }}
          >
            {caption}
          </div>
        )}
      </div>
    );
  },
);

PolaroidAvatar.displayName = "PolaroidAvatar";