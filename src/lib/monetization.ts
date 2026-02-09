/**
 * Monetization utility functions
 * 
 * IMPORTANT: This file must remain lightweight with NO React/UI imports.
 * It's imported by Settings and UpgradePrompt which are loaded early.
 * Keeping this separate prevents the admin components (and their heavy
 * dependencies like recharts) from being bundled into the main app.
 */

const MONETIZATION_OVERRIDE_KEY = "jet_monetization_override";

export type MonetizationOverride = "enabled" | "disabled";

export const getMonetizationOverride = (): MonetizationOverride => {
  if (typeof window === "undefined") return "disabled";
  return (localStorage.getItem(MONETIZATION_OVERRIDE_KEY) as MonetizationOverride) || "disabled";
};

export const setMonetizationOverride = (value: MonetizationOverride): void => {
  localStorage.setItem(MONETIZATION_OVERRIDE_KEY, value);
};

export const isMonetizationEnabled = (): boolean => {
  return getMonetizationOverride() === "enabled";
};
