import { useEffect } from "react";
import { useNavigate } from "react-router";

/**
 * Native (Capacitor) deep-link bridge.
 *
 * Listens for iOS Universal Links / Android App Links / custom-scheme URLs
 * (e.g. `jetaround://?venue=<id>` or `https://jet-around.com/?layers=density,paths`)
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
        const handle = await App.addListener("appUrlOpen", (event) => {
          try {
            const target = new URL(event.url);
            const path = target.pathname && target.pathname !== "" ? target.pathname : "/";
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