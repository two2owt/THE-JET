import { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Canonical page-level heading. Locks Syne display font, tight tracking,
 * and the responsive size scale used across every non-map tab so removing
 * one inline header (or adding a new page) can never drift.
 */
export function PageTitle({
  children,
  subtitle,
  className,
  as: Tag = "h1",
}: {
  children: ReactNode;
  subtitle?: ReactNode;
  className?: string;
  as?: "h1" | "h2";
}) {
  return (
    <header className={cn("mb-6", className)}>
      <Tag className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
        {children}
      </Tag>
      {subtitle && (
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      )}
    </header>
  );
}

/**
 * Canonical section heading inside a page. Right-aligned `meta` slot
 * holds counts/labels (e.g. "3 pending") so spacing stays uniform.
 */
export function SectionTitle({
  children,
  meta,
  subtitle,
  className,
}: {
  children: ReactNode;
  meta?: ReactNode;
  subtitle?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-4", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
          {children}
        </h2>
        {meta && (
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground tabular-nums shrink-0">
            {meta}
          </span>
        )}
      </div>
      {subtitle && (
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      )}
    </header>
  );
}