import jetMark128 from "@/assets/jet-mark-128.webp";

/**
 * Small, bundler-hashed JET mark used for avatars, watermarks and image
 * placeholders in the UI.
 *
 * The full-resolution `public/jet-email-logo.png` (1563x1563, ~36 KiB) is kept
 * for email templates only — shipping it to a 37x37 avatar slot cost ~35 KiB
 * per page load and had no cache headers. This asset is emitted under
 * `/assets/` so it inherits the immutable one-year cache policy.
 */
export const JET_MARK_SRC = jetMark128;
