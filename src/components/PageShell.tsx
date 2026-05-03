import type { CSSProperties, ReactNode } from "react";

/**
 * PageShell — shared inner layout for non-map tabs (Hot, Alerts, Saved, Crew).
 * Centralizes max-width, horizontal padding, and vertical gap so every tab
 * matches the Hot/Alerts shell exactly.
 */
interface PageShellProps {
  children: ReactNode;
  /** Override default 16px padding (e.g. tighter inner padding for nested tabs). */
  padding?: string;
  /** Override default 16px vertical gap between sections. */
  gap?: string;
  className?: string;
  style?: CSSProperties;
}

export function PageShell({
  children,
  padding = "16px",
  gap = "16px",
  className,
  style,
}: PageShellProps) {
  // Safe-area-aware padding: respects iOS notch (top), home indicator (bottom),
  // and landscape notch insets (left/right) while preserving the base padding.
  const safePadding = `calc(${padding} + env(safe-area-inset-top, 0px)) calc(${padding} + env(safe-area-inset-right, 0px)) calc(${padding} + env(safe-area-inset-bottom, 0px)) calc(${padding} + env(safe-area-inset-left, 0px))`;
  return (
    <div
      className={`max-w-7xl mx-auto${className ? ` ${className}` : ""}`}
      style={{
        padding: safePadding,
        display: "flex",
        flexDirection: "column",
        gap,
        ...style,
      }}
    >
      {children}
    </div>
  );
}