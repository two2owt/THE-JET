import React from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "next-themes";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App.tsx";

// Plus Jakarta Sans variable font - single import covers all weights
import "@fontsource-variable/plus-jakarta-sans";

import "./index.css";

// requestIdleCallback polyfill (must run before first usage)
if (!("requestIdleCallback" in window)) {
  (window as any).requestIdleCallback = (cb: any, options?: any) => {
    const start = Date.now();
    return window.setTimeout(() => {
      cb({
        didTimeout: false,
        timeRemaining: () => Math.max(0, 50 - (Date.now() - start)),
      });
    }, options?.timeout || 1);
  };
}

// Create QueryClient with optimized defaults - do this synchronously
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 30, // 30 minutes
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

// Render immediately - critical for FCP
const root = createRoot(document.getElementById("root")!);
root.render(
  <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </ThemeProvider>
);

// ========================================
// DEFERRED NON-CRITICAL INITIALIZATION
// Everything below runs AFTER React renders
// ========================================

// Helper to yield to main thread
const yieldToMain = (): Promise<void> => {
  return new Promise((resolve) => {
    if ('scheduler' in window && 'yield' in (window as any).scheduler) {
      (window as any).scheduler.yield().then(resolve);
    } else {
      requestAnimationFrame(() => setTimeout(resolve, 0));
    }
  });
};

// Start non-critical initialization after initial render completes
requestIdleCallback(() => {
  (async () => {
    // Prefetch Mapbox token during idle time
    await yieldToMain();
    const { prefetchMapboxToken, prefetchRoutes } = await import("@/lib/prefetch");
    prefetchMapboxToken();
    
    // Start route prefetching for instant navigation
    prefetchRoutes();
    
    // Load cache clearing utility for debugging
    import("@/utils/clearMapboxCache");
    
    // Wait for more idle time before analytics
    await new Promise<void>((resolve) => {
      requestIdleCallback(() => resolve(), { timeout: 5000 });
    });
    
    // Initialize analytics
    await yieldToMain();
    const { analytics } = await import("@/lib/analytics");
    analytics.init();
    
    // NOTE: Mapbox JS chunk is now loaded on-demand by MapboxHeatmap component
    // Removed eager prefetch to reduce TBT - the chunk loads when user views the map
    
    // Register service worker
    await yieldToMain();
    const { swTracker } = await import("@/lib/sw-tracker");
    await swTracker.registerWithTracking();
    
    // Prefetch map tiles for default city (after SW is registered for caching)
    await yieldToMain();
    const { initTilePrefetching } = await import("@/lib/tile-prefetch");
    initTilePrefetching();
  })();
}, { timeout: 3000 });

// Defer Sentry until user interaction - prevents loading ~82KB on initial load
let sentryLoaded = false;
const loadSentry = async () => {
  if (sentryLoaded) return;
  sentryLoaded = true;
  
  // Remove all listeners immediately
  const events = ['click', 'scroll', 'keydown', 'touchstart', 'mousemove'] as const;
  events.forEach(event => window.removeEventListener(event, loadSentry));
  
  // Use requestIdleCallback to avoid blocking any user interaction
  requestIdleCallback(async () => {
    const { initSentry } = await import("@/lib/sentry");
    await initSentry();
  }, { timeout: 5000 });
};

// Only add listeners after first paint is complete
if (document.readyState === 'complete') {
  setupSentryListeners();
} else {
  window.addEventListener('load', setupSentryListeners, { once: true });
}

function setupSentryListeners() {
  // Wait for first interaction or significant time
  const events = ['click', 'scroll', 'keydown', 'touchstart', 'mousemove'] as const;
  events.forEach(event => {
    window.addEventListener(event, loadSentry, { once: true, passive: true });
  });
  
  // Extended fallback - 30 seconds (was 15s)
  setTimeout(loadSentry, 30000);
}
