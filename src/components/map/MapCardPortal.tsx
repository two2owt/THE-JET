import { forwardRef, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface MapCardPortalProps {
  children: ReactNode;
  /** Renders the grab handle and applies swipe transform (touch viewports). */
  isMobile?: boolean;
  swipeStyle?: CSSProperties;
  swipeHandlers?: Record<string, unknown>;
}

/**
 * Shared bottom-sheet shell for map cards (JetCard, ParkingCard).
 *
 * Portaled to <body> so it escapes the map's stacking context, sized against
 * the safe-area-aware nav/header custom properties so it adapts to any
 * viewport without overlapping map chrome.
 */
export const MapCardPortal = forwardRef<HTMLDivElement, MapCardPortalProps>(
  function MapCardPortal(
    { children, isMobile = false, swipeStyle, swipeHandlers },
    ref,
  ) {
    if (typeof document === "undefined") return null;

    return createPortal(
      <div
        ref={ref}
        className="animate-fade-in"
        style={{
          position: "fixed",
          bottom: "calc(var(--bottom-nav-total-height, 60px) + 8px)",
          left: 0,
          width: "100vw",
          zIndex: 9999,
          padding: "0 12px",
          boxSizing: "border-box",
          pointerEvents: "none",
          ...(isMobile ? swipeStyle : {}),
        }}
        {...(isMobile ? swipeHandlers : {})}
      >
        <div
          style={{
            pointerEvents: "auto",
            width: "100%",
            maxWidth: "480px",
            margin: "0 auto",
            boxSizing: "border-box",
            maxHeight:
              "calc(100dvh - var(--header-total-height, 56px) - var(--bottom-nav-total-height, 60px) - 1.5rem)",
            overflowY: "auto",
            overscrollBehavior: "contain",
          }}
        >
          {isMobile && (
            <div className="flex justify-center pb-2 sm:pb-2.5">
              <div className="w-10 h-1 bg-muted-foreground/40 rounded-full" />
            </div>
          )}
          {children}
        </div>
      </div>,
      document.body,
    );
  },
);
