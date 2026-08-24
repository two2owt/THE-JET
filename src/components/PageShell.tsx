import type { CSSProperties, ReactNode } from "react";

/**
 * Variant presets for PageShell. Keeps spacing decisions centralized so tabs
 * stay visually consistent without duplicating layout values.
 * - `dense`   — tighter padding/gap for content-heavy tabs (lists, feeds).
 * - `default` — standard 16/16 used by Hot, Alerts, Saved, Crew.
 * - `relaxed` — generous spacing for hero/marketing-style tabs.
 */
export type PageShellVariant = "dense" | "default" | "relaxed";

const VARIANT_PRESETS: Record<
  PageShellVariant,
  { padding: string; gap: string }
> = {
  dense: { padding: "12px", gap: "12px" },
  default: { padding: "16px", gap: "16px" },
  relaxed: { padding: "24px", gap: "24px" },
};

/**
 * PageShell — shared inner layout for non-map tabs (Hot, Alerts, Saved, Crew).
 * Centralizes max-width, horizontal padding, and vertical gap so every tab
 * matches the Hot/Alerts shell exactly.
 */
interface PageShellProps {
  children: ReactNode;
  /** Spacing preset. Defaults to `default` (16px padding + gap). */
  variant?: PageShellVariant;
  /** Override variant padding (e.g. tighter inner padding for nested tabs). */
  padding?: string;
  /** Override variant vertical gap between sections. */
  gap?: string;
  className?: string;
  style?: CSSProperties;
  /**
   * Fill the parent height and skip bottom-nav clearance for full-bleed tabs
   * (e.g. chat). Horizontal padding still tracks the global header so the
   * content edges align with header controls.
   */
  fullHeight?: boolean;
}

export function PageShell({
  children,
  variant = "default",
  padding,
  gap,
  className,
  style,
  fullHeight = false,
}: PageShellProps) {
  const preset = VARIANT_PRESETS[variant];
  const resolvedPadding = padding ?? preset.padding;
  const resolvedGap = gap ?? preset.gap;
  // Safe-area-aware padding: respects iOS notch (top), home indicator (bottom),
  // and landscape notch insets (left/right) while preserving the base padding.
  // Horizontal padding tracks the global nav header so page content edges line
  // up cleanly with the header controls after the search bar is removed.
  // Bottom padding also clears the fixed footer nav so trailing content is never
  // hidden behind it on any screen size.
  const safePadding = fullHeight
    ? `0 calc(var(--header-pad-x, ${resolvedPadding}) + env(safe-area-inset-right, 0px)) 0 calc(var(--header-pad-x, ${resolvedPadding}) + env(safe-area-inset-left, 0px))`
    : `calc(${resolvedPadding} + env(safe-area-inset-top, 0px)) calc(var(--header-pad-x, ${resolvedPadding}) + env(safe-area-inset-right, 0px)) calc(${resolvedPadding} + var(--bottom-nav-total-height, calc(60px + env(safe-area-inset-bottom, 0px))) + 8px) calc(var(--header-pad-x, ${resolvedPadding}) + env(safe-area-inset-left, 0px))`;
  return (
    <div
      className={`w-full max-w-7xl mx-auto${className ? ` ${className}` : ""}`}
      style={{
        padding: safePadding,
        display: "flex",
        flexDirection: "column",
        gap: fullHeight ? 0 : resolvedGap,
        boxSizing: "border-box",
        ...(fullHeight ? { flex: "1 1 0%", minHeight: 0, height: "100%" } : {}),
        ...style,
      }}
    >
      {children}
    </div>
  );
}
