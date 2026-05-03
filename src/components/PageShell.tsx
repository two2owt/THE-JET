import type { CSSProperties, ReactNode } from "react";

/**
 * Variant presets for PageShell. Keeps spacing decisions centralized so tabs
 * stay visually consistent without duplicating layout values.
 * - `dense`   — tighter padding/gap for content-heavy tabs (lists, feeds).
 * - `default` — standard 16/16 used by Hot, Alerts, Saved, Crew.
 * - `relaxed` — generous spacing for hero/marketing-style tabs.
 */
export type PageShellVariant = "dense" | "default" | "relaxed";

const VARIANT_PRESETS: Record<PageShellVariant, { padding: string; gap: string }> = {
  dense:   { padding: "12px", gap: "12px" },
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
}

export function PageShell({
  children,
  variant = "default",
  padding,
  gap,
  className,
  style,
}: PageShellProps) {
  const preset = VARIANT_PRESETS[variant];
  const resolvedPadding = padding ?? preset.padding;
  const resolvedGap = gap ?? preset.gap;
  // Safe-area-aware padding: respects iOS notch (top), home indicator (bottom),
  // and landscape notch insets (left/right) while preserving the base padding.
  const safePadding = `calc(${resolvedPadding} + env(safe-area-inset-top, 0px)) calc(${resolvedPadding} + env(safe-area-inset-right, 0px)) calc(${resolvedPadding} + env(safe-area-inset-bottom, 0px)) calc(${resolvedPadding} + env(safe-area-inset-left, 0px))`;
  return (
    <div
      className={`max-w-7xl mx-auto${className ? ` ${className}` : ""}`}
      style={{
        padding: safePadding,
        display: "flex",
        flexDirection: "column",
        gap: resolvedGap,
        ...style,
      }}
    >
      {children}
    </div>
  );
}