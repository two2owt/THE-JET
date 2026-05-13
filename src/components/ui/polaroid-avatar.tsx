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

// Outer photo (square) widths. Frame padding scales from these.
const SIZE_PX: Record<Size, number> = {
  xs: 44,
  sm: 72,
  md: 96,
  lg: 128,
  xl: 176,
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
    const photoSize = SIZE_PX[size];
    // Polaroid proportions: ~6% frame, ~22% bottom strip relative to photo.
    const framePad = Math.max(6, Math.round(photoSize * 0.07));
    const bottomStrip = Math.max(18, Math.round(photoSize * 0.22));
    const tiltDeg = tiltDirection === "left" ? -2 : 2;

    return (
      <div
        ref={ref}
        onClick={onClick}
        role={onClick ? "button" : undefined}
        tabIndex={onClick ? 0 : undefined}
        aria-label={rest["aria-label"]}
        className={cn(
          "polaroid-avatar group/polaroid relative inline-block flex-shrink-0",
          "transition-transform duration-300 ease-out will-change-transform",
          "hover:-translate-y-0.5 focus-visible:-translate-y-0.5",
          onClick && "cursor-pointer",
          className,
        )}
        style={{
          // Hover tilt is composited (transform only) → 0 CLS.
          transform: "rotate(0deg)",
          padding: framePad,
          paddingBottom: bottomStrip,
          background:
            "linear-gradient(180deg, #FAFAF7 0%, #F2EFE7 100%)",
          borderRadius: 4,
          boxShadow:
            "0 1px 0 rgba(255,255,255,0.6) inset, 0 12px 28px -10px rgba(0,0,0,0.55), 0 4px 10px -4px rgba(0,0,0,0.45)",
          // Tilt on hover/focus only — applied via inline CSS variable swap.
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
        {/* Square photo */}
        <div
          className="relative overflow-hidden"
          style={{
            width: photoSize,
            height: photoSize,
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
              className="w-full h-full object-cover"
              draggable={false}
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
            className="absolute left-0 right-0 px-2 text-center truncate"
            style={{
              bottom: Math.round(bottomStrip * 0.18),
              color: "#1A1A1A",
              fontFamily:
                "'Caveat', 'Patrick Hand', 'Segoe Script', cursive",
              fontSize: Math.max(11, Math.round(photoSize * 0.14)),
              lineHeight: 1,
              letterSpacing: 0.2,
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