/**
 * Development-only logging.
 *
 * Production builds must not stream venue datasets, coordinates, or map
 * internals to the browser console — it is noise for users and leaks the
 * curated venue list to anyone with devtools open. Warnings and errors keep
 * using console directly so real problems still surface in production.
 */
export function devLog(...args: unknown[]): void {
  if (import.meta.env.DEV) console.log(...args);
}

export function devInfo(...args: unknown[]): void {
  if (import.meta.env.DEV) console.info(...args);
}
