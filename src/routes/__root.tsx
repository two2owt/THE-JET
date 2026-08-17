/// <reference types="vite/client" />
import { useEffect, useRef, memo } from "react";
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  Scripts,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { HelmetProvider } from "react-helmet-async";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider } from "@/contexts/AuthContext";
import { HeaderProvider } from "@/contexts/HeaderContext";
import { AppShell } from "@/components/AppShell";
import NotFound from "@/pages/NotFound";
import { useNativeDeepLinking } from "@/hooks/useNativeDeepLinking";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useForegroundPushMessages } from "@/hooks/useForegroundPushMessages";
import { usePushSubscriptionSync } from "@/hooks/usePushSubscriptionSync";
import { useViewportReflow } from "@/hooks/useViewportReflow";
import { reportLovableError } from "@/lib/lovable-error-reporting";
import appCss from "../styles.css?url";

// Fonts are declared in styles.css (linked in <head>) so they are discovered
// with the stylesheet instead of after the JS bundle executes — no FOUT flash.
import jakartaLatin from "@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2?url";
import syneLatin from "@fontsource-variable/syne/files/syne-latin-wght-normal.woff2?url";

// ported from index.html — runs before paint so the theme class never flashes
const themeInitScript = `(function(){var t='dark';try{var s=localStorage.getItem('theme');if(s==='light'||s==='dark'){t=s}}catch(e){}document.documentElement.classList.remove('light','dark');document.documentElement.classList.add(t);document.documentElement.style.colorScheme=t})();`;

// ported from index.html — warms the Mapbox token before the map chunk loads
const mapboxTokenPreloadScript = `!function(){var k="mapbox_token_cache_v2",c=localStorage.getItem(k);if(c){try{var d=JSON.parse(c);if(d.token&&d.token.startsWith("pk.")&&Date.now()-d.timestamp<864e5)return}catch(e){}}window.__mapboxTokenPromise=fetch("https://flvhduntedvorikonuvy.supabase.co/functions/v1/get-mapbox-token",{headers:{"apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZsdmhkdW50ZWR2b3Jpa29udXZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2NTA0MTYsImV4cCI6MjA4NjIyNjQxNn0.7sAHhmXL_2c68FYDs27gd2dRP2V8ZvtTcovBKnU4FHw"}}).then(function(r){return r.json()}).then(function(d){if(d&&d.token){localStorage.setItem(k,JSON.stringify({token:d.token,timestamp:Date.now()}));sessionStorage.setItem(k,JSON.stringify({token:d.token,timestamp:Date.now()}));window.__mapboxToken=d.token}}).catch(function(){})}();`;

// ported from index.html — defers the Mapbox GL JS bundle until idle/visible
const mapboxLoaderScript = `!function(){var m=!1,l=function(){if(!m){m=!0;var s=document.createElement("script");s.src="https://api.mapbox.com/mapbox-gl-js/v3.18.1/mapbox-gl.js";s.async=!0;s.crossOrigin="anonymous";document.head.appendChild(s)}};var d=function(){typeof requestIdleCallback!=="undefined"?requestIdleCallback(l,{timeout:6e3}):setTimeout(l,5e3)};document.readyState==="complete"?d():window.addEventListener("load",function(){setTimeout(d,200)},{once:!0});if("IntersectionObserver"in window){var o=new IntersectionObserver(function(e){e[0].isIntersecting&&(l(),o.disconnect())},{rootMargin:"200px"}),b=function(){var e=document.querySelector("[data-map-container]");e&&o.observe(e)};document.readyState==="loading"?document.addEventListener("DOMContentLoaded",b):b()}}();`;

// ported from index.html — Organization + WebSite structured data
const organizationJsonLd = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "JET",
  url: "https://jet-around.com/",
  logo: "https://jet-around.com/pwa-512x512.png",
  sameAs: ["https://twitter.com/JETaround"],
});
const websiteJsonLd = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "JET",
  url: "https://jet-around.com/",
});

const TITLE = "JET — Find Live Deals & Events Near You in Charlotte";
const DESCRIPTION =
  "Discover trending venues, live events, and exclusive happy-hour deals across Charlotte on a real-time heatmap. Your guide to what's hot right now.";
const SOCIAL_IMAGE = "https://jet-around.com/pwa-512x512.png";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1.0, viewport-fit=cover" },
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "author", content: "JET" },
      {
        name: "keywords",
        content:
          "Charlotte nightlife, CLT events, Charlotte bars, restaurants near me, things to do Charlotte",
      },
      {
        name: "google-site-verification",
        content: "NaHWfiMq4v81RSUiLCSniJmSspDHkqzloJd7s7SX5vg",
      },
      { name: "theme-color", content: "#0f0f0f" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { name: "apple-mobile-web-app-title", content: "JET" },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://jet-around.com/" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:image", content: SOCIAL_IMAGE },
      { property: "og:image:width", content: "512" },
      { property: "og:image:height", content: "512" },
      { property: "og:image:type", content: "image/png" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@JETaround" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
      { name: "twitter:image", content: SOCIAL_IMAGE },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      // Preload the latin variable subsets actually used above the fold so the
      // first paint uses the real typeface (no swap-induced reflow / flash).
      {
        rel: "preload",
        as: "font",
        type: "font/woff2",
        href: jakartaLatin,
        crossOrigin: "anonymous",
      },
      {
        rel: "preload",
        as: "font",
        type: "font/woff2",
        href: syneLatin,
        crossOrigin: "anonymous",
      },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon-180x180.png" },
      { rel: "apple-touch-icon", sizes: "152x152", href: "/apple-touch-icon-152x152.png" },
      { rel: "apple-touch-icon", sizes: "120x120", href: "/apple-touch-icon-120x120.png" },
      { rel: "preconnect", href: "https://api.mapbox.com", crossOrigin: "anonymous" },
      {
        rel: "preconnect",
        href: "https://flvhduntedvorikonuvy.supabase.co",
        crossOrigin: "anonymous",
      },
      { rel: "dns-prefetch", href: "https://b.tiles.mapbox.com" },
      { rel: "dns-prefetch", href: "https://c.tiles.mapbox.com" },
      { rel: "dns-prefetch", href: "https://d.tiles.mapbox.com" },
      { rel: "dns-prefetch", href: "https://tiles.mapbox.com" },
      { rel: "dns-prefetch", href: "https://events.mapbox.com" },
      { rel: "dns-prefetch", href: "https://maps.googleapis.com" },
      { rel: "stylesheet", href: "https://api.mapbox.com/mapbox-gl-js/v3.18.1/mapbox-gl.css" },
    ],
    scripts: [
      { children: themeInitScript },
      { type: "application/ld+json", children: organizationJsonLd },
      { type: "application/ld+json", children: websiteJsonLd },
      { children: mapboxTokenPreloadScript },
      { children: mapboxLoaderScript },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFound,
  errorComponent: RootErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

/** Route-change analytics — ported from App.tsx's PageTracker */
const PageTracker = memo(function PageTracker() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const analyticsRef = useRef<typeof import("@/lib/analytics").analytics | null>(null);

  useEffect(() => {
    if (!analyticsRef.current) {
      import("@/lib/analytics").then(({ analytics }) => {
        analyticsRef.current = analytics;
        analytics.pageView(pathname);
      });
    } else {
      analyticsRef.current.pageView(pathname);
    }
  }, [pathname]);

  return null;
});

function AppLayout() {
  useNativeDeepLinking();
  usePushNotifications();
  useForegroundPushMessages();
  usePushSubscriptionSync();
  useViewportReflow();

  // ported from main.tsx — deferred, non-critical bootstrap
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!("requestIdleCallback" in window)) {
      (window as any).requestIdleCallback = (cb: any, options?: any) => {
        const start = Date.now();
        return window.setTimeout(() => {
          cb({ didTimeout: false, timeRemaining: () => Math.max(0, 50 - (Date.now() - start)) });
        }, options?.timeout || 1);
      };
    }

    const yieldToMain = (): Promise<void> =>
      new Promise((resolve) => {
        if ("scheduler" in window && "yield" in (window as any).scheduler) {
          (window as any).scheduler.yield().then(resolve);
        } else {
          requestAnimationFrame(() => setTimeout(resolve, 0));
        }
      });

    let sentryLoaded = false;
    const interactionEvents = ["click", "scroll", "keydown", "touchstart", "mousemove"] as const;
    const loadSentry = async () => {
      if (sentryLoaded) return;
      sentryLoaded = true;
      interactionEvents.forEach((event) => window.removeEventListener(event, loadSentry));
      requestIdleCallback(
        async () => {
          const { initSentry } = await import("@/lib/sentry");
          await initSentry();
        },
        { timeout: 5000 },
      );
    };

    requestIdleCallback(
      () => {
        (async () => {
          await yieldToMain();
          const { prefetchMapboxToken, prefetchRoutes } = await import("@/lib/prefetch");
          prefetchMapboxToken();
          prefetchRoutes();
          import("@/utils/clearMapboxCache");

          await new Promise<void>((resolve) => {
            requestIdleCallback(() => resolve(), { timeout: 5000 });
          });

          await yieldToMain();
          const { analytics } = await import("@/lib/analytics");
          analytics.init();

          await yieldToMain();
          const { initTilePrefetching } = await import("@/lib/tile-prefetch");
          initTilePrefetching();
        })();
      },
      { timeout: 3000 },
    );

    interactionEvents.forEach((event) =>
      window.addEventListener(event, loadSentry, { once: true, passive: true }),
    );
    const sentryTimer = window.setTimeout(loadSentry, 8000);

    return () => {
      window.clearTimeout(sentryTimer);
      interactionEvents.forEach((event) => window.removeEventListener(event, loadSentry));
    };
  }, []);

  return (
    <AppShell>
      <Sonner />
      <PageTracker />
      <Outlet />
    </AppShell>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      forcedTheme="dark"
      enableSystem={false}
      disableTransitionOnChange
    >
      <QueryClientProvider client={queryClient}>
        <HelmetProvider>
          <ErrorBoundary>
            <AuthProvider>
              <HeaderProvider>
                <TooltipProvider>
                  <AppLayout />
                </TooltipProvider>
              </HeaderProvider>
            </AuthProvider>
          </ErrorBoundary>
        </HelmetProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

function RootErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();

  console.error(error);

  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center text-foreground">
      <h1 className="text-2xl font-semibold">This page didn't load</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Something went wrong while rendering this page. You can try again or head back home.
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          onClick={() => {
            router.invalidate();
            reset();
          }}
        >
          Try again
        </button>
        <a
          href="/"
          className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground"
        >
          Go home
        </a>
      </div>
    </div>
  );
}