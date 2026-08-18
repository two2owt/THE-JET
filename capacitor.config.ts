import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor configuration for JET native iOS / Android builds.
 *
 * The web app remains the primary deploy target (Lovable + Vercel). This config
 * lets you wrap the same `dist/` bundle into a native shell for App Store /
 * Play Store submission.
 *
 * Build flow (run locally after `git pull` from GitHub):
 *   1. bun install
 *   2. bun run build
 *   3. npx cap add ios && npx cap add android   (first time only)
 *   4. npx cap sync
 *   5. npx cap open ios     // requires Xcode on macOS
 *      npx cap open android // requires Android Studio
 *
 * The `server.url` block enables hot-reload from the Lovable sandbox while
 * developing on a physical device. Comment it out (or set CAP_PROD=1) before
 * producing a release build so the bundled `dist/` is used.
 *
 * Background location (@capacitor-community/background-geolocation) needs
 * native project edits after `npx cap add`:
 *   iOS  ios/App/App/Info.plist
 *     NSLocationWhenInUseUsageDescription
 *     NSLocationAlwaysAndWhenInUseUsageDescription
 *     UIBackgroundModes -> <string>location</string>
 *   Android android/app/src/main/AndroidManifest.xml
 *     ACCESS_COARSE_LOCATION, ACCESS_FINE_LOCATION,
 *     ACCESS_BACKGROUND_LOCATION (API 29+),
 *     FOREGROUND_SERVICE + FOREGROUND_SERVICE_LOCATION (API 34+)
 */
const isProd = process.env.CAP_PROD === "1";

const config: CapacitorConfig = {
  appId: "app.lovable.dafac77279084bdb873c58a805d7581e",
  appName: "JET",
  webDir: "dist",
  backgroundColor: "#0A0A0A",
  ...(isProd
    ? {}
    : {
        server: {
          url: "https://dafac772-7908-4bdb-873c-58a805d7581e.lovableproject.com?forceHideBadge=true",
          cleartext: true,
        },
      }),
  ios: {
    contentInset: "always",
    limitsNavigationsToAppBoundDomains: false,
    backgroundColor: "#0A0A0A",
    // Universal Links are configured via the associated-domains entitlement
    // in Xcode (applinks:jet-around.com). The `appUrlOpen` listener in
    // src/hooks/useNativeDeepLinking.ts forwards the incoming URL into
    // react-router so ?venue / ?deal / ?layers behave identically to web.
    scheme: "JET",
  },
  android: {
    backgroundColor: "#0A0A0A",
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: "#0A0A0A",
      showSpinner: false,
      androidScaleType: "CENTER_CROP",
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0A0A0A",
      overlaysWebView: true,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
