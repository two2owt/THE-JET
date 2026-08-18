/**
 * Native background geolocation (iOS + Android) via
 * `@capacitor-community/background-geolocation`.
 *
 * Web is unaffected: nothing here is imported unless `isNativeApp()` is true,
 * and every entry point is dynamically imported so the browser bundle never
 * evaluates the plugin. On web the browser simply cannot track in the
 * background — `useLocationTracker`'s visibility/poll fallback stays in charge.
 *
 * The plugin keeps a foreground service (Android) / significant-location
 * updates (iOS) alive while the app is backgrounded, delivering fixes to the
 * same `maybeWrite` pipeline the foreground watcher uses, so smoothing,
 * throttling and k-anonymity behave identically.
 *
 * Native project requirements (run `npx cap sync` after pulling):
 * - iOS Info.plist: NSLocationWhenInUseUsageDescription,
 *   NSLocationAlwaysAndWhenInUseUsageDescription, and UIBackgroundModes
 *   containing `location`.
 * - Android manifest: ACCESS_COARSE_LOCATION, ACCESS_FINE_LOCATION,
 *   ACCESS_BACKGROUND_LOCATION (API 29+) and FOREGROUND_SERVICE_LOCATION
 *   (API 34+).
 */

export type BackgroundFix = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
};

export type BackgroundWatcher = { id: string };

type PluginLocation = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
};

type BackgroundGeolocationPlugin = {
  addWatcher(
    options: {
      backgroundMessage?: string;
      backgroundTitle?: string;
      requestPermissions?: boolean;
      stale?: boolean;
      distanceFilter?: number;
    },
    callback: (position?: PluginLocation, error?: { code?: string }) => void,
  ): Promise<string>;
  removeWatcher(options: { id: string }): Promise<void>;
  openSettings(): Promise<void>;
};

let cached: BackgroundGeolocationPlugin | null | undefined;

/**
 * The community plugin ships native code + typings only (no JS entry), so it
 * is bound through Capacitor's `registerPlugin` rather than imported directly.
 * Importing the package would break the web bundle at build time.
 */
const loadPlugin = async (): Promise<BackgroundGeolocationPlugin | null> => {
  if (cached !== undefined) return cached;
  try {
    const { registerPlugin, Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) {
      cached = null;
      return null;
    }
    cached = registerPlugin<BackgroundGeolocationPlugin>(
      "BackgroundGeolocation",
    );
    return cached;
  } catch {
    cached = null;
    return null;
  }
};

/**
 * Start the background watcher.
 *
 * `requestPermissions` is false: JET never prompts from the tracker — the
 * always-allow grant is requested explicitly from the settings toggle
 * (`requestBackgroundPermission`) so the ask stays user-initiated.
 * Returns null when the plugin is unavailable or the grant is missing, letting
 * the caller fall back to the foreground `@capacitor/geolocation` watcher.
 */
export const startBackgroundWatcher = async (
  onFix: (fix: BackgroundFix) => void,
  opts?: { requestPermissions?: boolean; distanceFilter?: number },
): Promise<BackgroundWatcher | null> => {
  const plugin = await loadPlugin();
  if (!plugin) return null;
  try {
    const id = await plugin.addWatcher(
      {
        backgroundTitle: "JET is finding live activity near you",
        backgroundMessage:
          "Location is used to power the live heatmap and nearby deals.",
        requestPermissions: opts?.requestPermissions ?? false,
        // Skip cached/stale fixes — the smoother expects fresh samples.
        stale: false,
        // Metres of movement before the OS wakes us. Matches the tracker's
        // moving-state gate so we don't burn battery on stationary noise.
        distanceFilter: opts?.distanceFilter ?? 20,
      },
      (position, error) => {
        if (error || !position) return;
        onFix({
          latitude: position.latitude,
          longitude: position.longitude,
          accuracy: position.accuracy ?? null,
        });
      },
    );
    return { id };
  } catch {
    // Permission missing / plugin not installed in this native shell.
    return null;
  }
};

export const stopBackgroundWatcher = async (watcher: BackgroundWatcher) => {
  const plugin = await loadPlugin();
  if (!plugin) return;
  try {
    await plugin.removeWatcher({ id: watcher.id });
  } catch {
    /* already torn down */
  }
};

/**
 * User-initiated "always allow" request: starts a watcher WITH the permission
 * prompt, then immediately removes it. Call from the settings toggle only.
 * Resolves true when a watcher could be created (i.e. permission granted).
 */
export const requestBackgroundPermission = async (): Promise<boolean> => {
  const watcher = await startBackgroundWatcher(() => {}, {
    requestPermissions: true,
  });
  if (!watcher) return false;
  await stopBackgroundWatcher(watcher);
  return true;
};

/** Deep-link into the OS location settings when permission was denied. */
export const openLocationSettings = async () => {
  const plugin = await loadPlugin();
  try {
    await plugin?.openSettings();
    return;
  } catch {
    /* fall through to URL-based fallback */
  }

  // Fallback: try platform-specific settings URLs when the plugin's own
  // openSettings() is unavailable or throws.
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return;

    const platform = Capacitor.getPlatform();
    if (platform === "ios") {
      // Opens the JET section inside iOS Settings.
      window.location.href = "app-settings:";
      return;
    }

    if (platform === "android") {
      const { App } = await import("@capacitor/app");
      const info = await App.getAppInfo();
      // Application details settings for this package.
      window.location.href = `intent:#Intent;action=android.settings.APPLICATION_DETAILS_SETTINGS;scheme=package;package=${info.id};end`;
    }
  } catch {
    /* nothing more we can do on this device */
  }
};
