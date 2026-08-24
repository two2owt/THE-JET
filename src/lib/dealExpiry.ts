/**
 * Shared end-date logic for merchant deals.
 *
 * Merchant rows carry `expires_at` (ISO). Everywhere we surface a deal — the
 * /deals list, JetCards, and alert cards — we want the same wording:
 *   - future  → "3d left" / "5h left" / "20m left"
 *   - past    → "Expired"
 */

export interface DealExpiry {
  expired: boolean;
  /** Short human label, e.g. "3d left" or "Expired". */
  label: string;
  /** Spelled-out variant for roomy surfaces, e.g. "3 days left". */
  longLabel: string;
  /** Sentence used on badges, e.g. "Expires in 3d" or "Expired". */
  badgeLabel: string;
  /** Milliseconds until expiry (negative once expired). */
  msRemaining: number;
}

export const getDealExpiry = (
  expiresAt: string | null | undefined,
  now: number = Date.now(),
): DealExpiry | null => {
  if (!expiresAt) return null;
  const expires = new Date(expiresAt).getTime();
  if (Number.isNaN(expires)) return null;

  const msRemaining = expires - now;
  if (msRemaining <= 0) {
    return { expired: true, label: "Expired", msRemaining };
  }

  const minutes = Math.floor(msRemaining / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const label =
    days > 0
      ? `${days}d left`
      : hours > 0
        ? `${hours}h left`
        : `${Math.max(minutes, 1)}m left`;

  return { expired: false, label, msRemaining };
};

/** True when a deal has an `expires_at` in the past. */
export const isDealExpired = (
  expiresAt: string | null | undefined,
  now: number = Date.now(),
): boolean => getDealExpiry(expiresAt, now)?.expired ?? false;
