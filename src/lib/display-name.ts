/**
 * Privacy-safe display names.
 *
 * Users who never picked a name get a deterministic anonymous handle
 * derived from their user id (e.g. `jet_7f3a91`). Email addresses are
 * never used as a fallback anywhere in the UI — not as a name, not as
 * alt text, not in notifications.
 */

const AUTO_HANDLE_RE = /^jet_[0-9a-f]{6}$/i;

/** Cheap FNV-1a hex digest, mirrors the DB's md5-prefix shape closely enough for UI-only use. */
function hashHex(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0").slice(0, 6);
}

/** Deterministic anonymous handle for a user id. */
export function autoHandle(userId: string | null | undefined): string {
  if (!userId) return "jet_member";
  return `jet_${hashHex(userId)}`;
}

/** True when the name looks like a system-generated handle rather than a chosen one. */
export function isAutoHandle(name: string | null | undefined): boolean {
  return !!name && AUTO_HANDLE_RE.test(name.trim());
}

/** True when a stored display name would leak an email address. */
export function looksLikeEmail(name: string | null | undefined): boolean {
  return !!name && name.includes("@");
}

/**
 * Resolve what to render for a user. Never returns an email address.
 */
export function resolveDisplayName(
  name: string | null | undefined,
  userId?: string | null,
): string {
  const trimmed = name?.trim();
  if (!trimmed || looksLikeEmail(trimmed)) return autoHandle(userId);
  return trimmed;
}

/** True when the profile still needs the user to choose a real name. */
export function needsDisplayNameClaim(
  profile:
    | {
        display_name?: string | null;
        display_name_claimed?: boolean | null;
      }
    | null
    | undefined,
): boolean {
  if (!profile) return false;
  if (profile.display_name_claimed) return false;
  return (
    !profile.display_name ||
    isAutoHandle(profile.display_name) ||
    looksLikeEmail(profile.display_name)
  );
}
