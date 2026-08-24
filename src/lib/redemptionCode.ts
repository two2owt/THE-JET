/** Human-readable, unambiguous redemption code alphabet (no I/O/0/1). */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** QR payload prefix so the scanner can distinguish JET codes from other QRs. */
export const REDEMPTION_QR_PREFIX = "JETRDM:";

export function generateRedemptionCode(): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  const chars = Array.from(
    bytes,
    (b) => ALPHABET[b % ALPHABET.length] as string,
  );
  return `JET-${chars.slice(0, 5).join("")}-${chars.slice(5).join("")}`;
}

/** Normalize a scanned or typed value into a bare redemption code. */
export function parseRedemptionCode(raw: string): string | null {
  const value = raw.trim().toUpperCase();
  const stripped = value.startsWith(REDEMPTION_QR_PREFIX)
    ? value.slice(REDEMPTION_QR_PREFIX.length)
    : value;
  return /^[A-Z0-9-]{6,32}$/.test(stripped) ? stripped : null;
}

export function toQrPayload(code: string): string {
  return `${REDEMPTION_QR_PREFIX}${code}`;
}
