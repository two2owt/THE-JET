/**
 * Shared deal badge primitives.
 *
 * Every surface that renders a merchant deal (/deals list, JetCard detail,
 * alert cards) uses these so the deal type, venue category and end-date state
 * look and read identically.
 */
import { Clock } from "lucide-react";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import {
  getDealPresentation,
  type DealPresentation,
  type DealPresentationInput,
} from "@/lib/dealPresentation";

/**
 * Re-renders on each wall-clock minute boundary so countdowns stay live.
 * Uses the shared app clock: one timer for every badge on screen, paused while
 * the tab is hidden, and skipped entirely for deals with no expiry.
 */
export const useDealPresentation = (
  deal: DealPresentationInput | null | undefined,
): DealPresentation | null => {
  const nowTs = useMinuteClock(Boolean(deal?.expires_at));
  if (!deal) return null;
  return getDealPresentation(deal, nowTs);
};


const sizeClass = (size: "sm" | "md") =>
  size === "sm"
    ? "px-1.5 py-0.5 text-[9px] sm:text-[10px]"
    : "px-2 py-0.5 text-[10px] sm:text-xs";

export const DealTypeBadge = ({
  presentation,
  size = "sm",
}: {
  presentation: DealPresentation;
  size?: "sm" | "md";
}) => {
  if (!presentation.typeLabel) return null;
  return (
    <span
      className={`inline-flex items-center rounded-full border border-primary/30 bg-primary/10 font-semibold uppercase tracking-wide text-primary ${sizeClass(size)}`}
    >
      {presentation.typeLabel}
    </span>
  );
};

export const DealCategoryBadge = ({
  presentation,
  size = "sm",
}: {
  presentation: DealPresentation;
  size?: "sm" | "md";
}) => {
  const { category } = presentation;
  const Icon = category.Icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-medium ${sizeClass(size)}`}
      style={{
        color: category.dark,
        borderColor: `${category.dark}55`,
        backgroundColor: `${category.dark}1a`,
      }}
    >
      <Icon className="w-2.5 h-2.5" aria-hidden="true" />
      {category.label}
    </span>
  );
};

export const DealExpiryBadge = ({
  presentation,
  size = "sm",
}: {
  presentation: DealPresentation;
  size?: "sm" | "md";
}) => {
  const { expiry } = presentation;
  if (!expiry) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-semibold ${sizeClass(size)} ${
        expiry.expired
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : "border-warm/40 bg-warm/10 text-warm"
      }`}
    >
      <Clock className="w-2.5 h-2.5" aria-hidden="true" />
      {expiry.badgeLabel}
    </span>
  );
};

/** Type + category + expiry in one row — the canonical deal metadata strip. */
export const DealMetaBadges = ({
  presentation,
  size = "sm",
  className = "",
}: {
  presentation: DealPresentation | null;
  size?: "sm" | "md";
  className?: string;
}) => {
  if (!presentation) return null;
  return (
    <div className={`flex flex-wrap items-center gap-1 ${className}`}>
      <DealTypeBadge presentation={presentation} size={size} />
      <DealCategoryBadge presentation={presentation} size={size} />
      <DealExpiryBadge presentation={presentation} size={size} />
    </div>
  );
};
