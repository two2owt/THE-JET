/**
 * Monetization flag store.
 *
 * The flag is a GLOBAL, server-owned setting stored in `public.app_config`
 * under the key `monetization_enabled`. It is fetched once on app start and
 * kept live over Realtime, so an admin flipping the switch applies the paywall
 * and price gating to every user on every device immediately — no rebuild, no
 * per-device localStorage override.
 *
 * IMPORTANT: This file must remain lightweight with NO React/UI imports.
 * It's imported by Settings and UpgradePrompt which are loaded early.
 * Keeping this separate prevents the admin components (and their heavy
 * dependencies like recharts) from being bundled into the main app.
 */

/** app_config key backing the flag. */
export const MONETIZATION_CONFIG_KEY = "monetization_enabled";

export type MonetizationOverride = "enabled" | "disabled";

type Listener = () => void;

// Fail closed on "disabled": until the config lands, everything is unlocked.
// Showing a paywall we later have to retract is worse than a brief free pass.
let enabled = false;
let hydrated = false;
const listeners = new Set<Listener>();

const emit = () => {
  for (const listener of listeners) listener();
};

/** Subscribe to flag changes (useSyncExternalStore contract). */
export const subscribeMonetization = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Current flag value. Synchronous — safe inside render. */
export const isMonetizationEnabled = (): boolean => enabled;

/** True once the value has been read from the backend at least once. */
export const isMonetizationHydrated = (): boolean => hydrated;

/**
 * Apply a value received from the backend (initial fetch, Realtime event, or
 * an admin's optimistic write). No-ops when nothing actually changed so
 * subscribers don't re-render on every heartbeat.
 */
export const applyMonetizationValue = (value: boolean): void => {
  const changed = enabled !== value || !hydrated;
  enabled = value;
  hydrated = true;
  if (changed) emit();
};

/** Compat helper for the admin toggle UI. */
export const getMonetizationOverride = (): MonetizationOverride =>
  enabled ? "enabled" : "disabled";

/** Coerce an `app_config.value` jsonb payload into a boolean. */
export const parseMonetizationValue = (value: unknown): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value === "true" || value === "enabled";
  return false;
};
