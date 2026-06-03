/**
 * Runtime platform detection.
 *
 * Works whether or not Capacitor is actually installed at runtime — when the
 * app is loaded in a normal browser, `isNativeApp()` returns false and
 * `isIOSNative()` / `isAndroidNative()` are false. This lets the same web
 * bundle ship to web AND to the native shell without code-splitting.
 */

type CapacitorGlobal = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => 'ios' | 'android' | 'web';
};

function getCap(): CapacitorGlobal | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
}

export function isNativeApp(): boolean {
  const cap = getCap();
  return Boolean(cap?.isNativePlatform?.());
}

export function getPlatform(): 'ios' | 'android' | 'web' {
  const cap = getCap();
  return cap?.getPlatform?.() ?? 'web';
}

export function isIOSNative(): boolean {
  return isNativeApp() && getPlatform() === 'ios';
}

export function isAndroidNative(): boolean {
  return isNativeApp() && getPlatform() === 'android';
}

/**
 * Apple App Store policy: digital subscriptions sold on iOS must go through
 * StoreKit (IAP). Since JET sells JET+/JETx via Stripe on the web, we hide
 * all upgrade / checkout CTAs inside the iOS native shell to stay compliant.
 * Web and Android remain unchanged.
 */
export function canPurchaseSubscription(): boolean {
  return !isIOSNative();
}