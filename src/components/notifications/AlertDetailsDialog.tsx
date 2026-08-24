/**
 * Alert details modal.
 *
 * Opened from an alert card's "Details" button. Shows the venue, the merchant's
 * deal terms (type, description, active days, run window) and the EXACT
 * `expires_at` timestamp, alongside the live countdown / expired state that the
 * shared deal presentation layer produces everywhere else.
 */
import { Clock, ExternalLink, MapPin, Tag } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DealMetaBadges } from "@/components/deals/DealBadges";
import { getDealPresentation } from "@/lib/dealPresentation";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import type { AlertDeal } from "@/hooks/useNotifications";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export interface AlertDetailsTarget {
  id: string;
  title: string;
  message: string;
  venue?: string;
  venueId?: string;
  dealId?: string;
  sentAt?: string;
}

interface AlertDetailsDialogProps {
  alert: AlertDetailsTarget | null;
  deal?: AlertDeal | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Opens the venue's JetCard on the map. */
  onViewVenue?: (target: string) => void;
}

/** Full, unambiguous timestamp — no relative wording. */
const formatExact = (iso: string | null | undefined): string | null => {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  return at.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
};

const Row = ({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) => (
  <div className="flex items-start gap-2.5">
    <div className="mt-0.5 text-muted-foreground shrink-0" aria-hidden="true">
      {icon}
    </div>
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="text-sm text-foreground break-words">{children}</div>
    </div>
  </div>
);

export function AlertDetailsDialog({
  alert,
  deal,
  open,
  onOpenChange,
  onViewVenue,
}: AlertDetailsDialogProps) {
  // Keeps the countdown inside the modal flipping with every other surface.
  const now = useMinuteClock(Boolean(deal?.expires_at));
  const presentation = deal ? getDealPresentation(deal, now) : null;

  if (!alert) return null;

  const venueName = deal?.venue_name || alert.venue;
  const venueTarget = deal?.venue_id || alert.venueId || venueName;
  const exactExpiry = formatExact(deal?.expires_at);
  const exactStart = formatExact(deal?.starts_at);
  const activeDays = (deal?.active_days ?? [])
    .map((d) => DAY_LABELS[d] ?? null)
    .filter(Boolean) as string[];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base leading-snug pr-6">
            {deal?.title || alert.title}
          </DialogTitle>
          <DialogDescription className="text-sm">
            {deal?.description || alert.message}
          </DialogDescription>
        </DialogHeader>

        {presentation && (
          <DealMetaBadges presentation={presentation} className="mb-1" />
        )}

        <div className="space-y-3.5">
          {venueName && (
            <Row icon={<MapPin className="w-4 h-4" />} label="Venue">
              <p className="font-semibold">{venueName}</p>
              {deal?.venue_address && (
                <p className="text-xs text-muted-foreground">
                  {deal.venue_address}
                </p>
              )}
            </Row>
          )}

          <Row icon={<Tag className="w-4 h-4" />} label="Deal terms">
            {presentation?.typeLabel && (
              <p>
                <span className="font-semibold">{presentation.typeLabel}</span>
                {presentation.category?.label
                  ? ` · ${presentation.category.label}`
                  : ""}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {deal?.description || alert.message}
            </p>
            {activeDays.length > 0 && activeDays.length < 7 && (
              <p className="text-xs text-muted-foreground mt-1">
                Valid {activeDays.join(", ")}
              </p>
            )}
            {!deal && (
              <p className="text-xs text-muted-foreground mt-1">
                Full terms aren&apos;t available for this alert.
              </p>
            )}
          </Row>

          <Row icon={<Clock className="w-4 h-4" />} label="Expires">
            {exactExpiry ? (
              <>
                <p className="font-semibold">
                  <time dateTime={deal?.expires_at ?? undefined}>
                    {exactExpiry}
                  </time>
                </p>
                <p className="text-xs text-muted-foreground">
                  {presentation?.expiry?.expired
                    ? "This deal has ended"
                    : (presentation?.expiry?.longLabel ?? "")}
                </p>
              </>
            ) : (
              <p className="text-muted-foreground">No end date set</p>
            )}
            {exactStart && (
              <p className="text-xs text-muted-foreground mt-1">
                Started {exactStart}
              </p>
            )}
          </Row>

          {alert.sentAt && (
            <Row icon={<Clock className="w-4 h-4" />} label="Alert sent">
              <time dateTime={alert.sentAt}>{formatExact(alert.sentAt)}</time>
            </Row>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          {deal?.website_url && (
            <Button asChild variant="outline" className="sm:w-auto">
              <a
                href={deal.website_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Venue site
                <ExternalLink className="w-3.5 h-3.5 ml-1.5" />
              </a>
            </Button>
          )}
          {venueTarget && onViewVenue && (
            <Button
              onClick={() => {
                onOpenChange(false);
                onViewVenue(venueTarget);
              }}
            >
              View on map
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AlertDetailsDialog;
