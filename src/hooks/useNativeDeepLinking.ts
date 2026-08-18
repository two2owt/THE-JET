import { useEffect } from "react";
import { useNavigate } from "@/lib/router-compat";
import { queueDeepLink } from "@/lib/pendingDeepLink";

/**
 * Native (Capacitor) deep-link bridge.
 *
 * Listens for iOS Universal Links / Android App Links / custom-scheme URLs
 * (e.g. `jetaround://?venue=<id>` or `https://www.jet-around.com/?layers=density,paths`)
 * and forwards the path + search + hash into react-router. This lets the
 * existing `useDeepLinking` and `layerPersistence` handlers run unchanged
 * on the native shells — same behavior as the web ?venue / ?deal / ?layers flow.
 *
 * Web-only builds are a no-op: dynamic import of `@capacitor/app` is guarded
 * so bundlers don't require the plugin at runtime when Capacitor isn't present.
 */
export function useNativeDeepLinking() {
  const navigate = useNavigate();

  useEffect(() => {
    // Only load Capacitor bindings in a native shell.
    const isNative =
      typeof window !== "undefined" &&
      // @ts-expect-error - injected by Capacitor at runtime on native
      (window.Capacitor?.isNativePlatform?.() ?? false);
    if (!isNative) return;

    let cleanup: (() => void) | undefined;

    (async () => {
      try {
        const { App } = await import("@capacitor/app");
        // Cold start: the launch URL is already consumed by the time the
        // listener attaches, so read it explicitly and queue it.
        try {
          const launch = await App.getLaunchUrl();
          if (launch?.url) {
            const target = new URL(launch.url);
            queueDeepLink(
              `${target.pathname || "/"}${target.search}${target.hash}`,
            );
          }
        } catch {
          /* no launch URL */
        }

        const handle = await App.addListener("appUrlOpen", (event) => {
          try {
            const target = new URL(event.url);
            const path =
              target.pathname && target.pathname !== "" ? target.pathname : "/";
            navigate(`${path}${target.search}${target.hash}`);
          } catch {
            // Ignore malformed URLs.
          }
        });
        cleanup = () => {
          handle.remove();
        };
      } catch {
        // Plugin unavailable — treat as no-op.
      }
    })();

    return () => cleanup?.();
  }, [navigate]);
}
