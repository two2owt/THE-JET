import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";
import cssnano from "cssnano";
import { visualizer } from "rollup-plugin-visualizer";
// Critters import removed — plugin disabled (caused nav CSS deferral in prod)
import fs from "fs";

// ---------------------------------------------------------------------------
// jet-vite-integration-check
// Verifies that "vite" (jet-vite) and "@vitejs/plugin-react-swc"
// (jet-vite-react) are installed by reading their package.json directly
// from node_modules — avoids exports-map resolution issues with require().
// ---------------------------------------------------------------------------
function jetViteIntegrationCheck(): Plugin {
  return {
    name: "jet-vite-integration-check",
    enforce: "pre",
    buildStart() {
      const checks: { pkgPath: string; label: string }[] = [
        {
          pkgPath: path.resolve("node_modules/vite/package.json"),
          label: "jet-vite (vite)",
        },
        {
          pkgPath: path.resolve("node_modules/@vitejs/plugin-react-swc/package.json"),
          label: "jet-vite-react (@vitejs/plugin-react-swc)",
        },
      ];

      let allOk = true;
      for (const { pkgPath, label } of checks) {
        if (fs.existsSync(pkgPath)) {
          const { version } = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as { version: string };
          console.log(`\x1b[32m✔\x1b[0m ${label} → v${version}`);
        } else {
          console.error(`\x1b[31m✘\x1b[0m ${label} not found – run \`npm install\``);
          allOk = false;
        }
      }

      if (!allOk) {
        throw new Error(
          "[jet-vite-integration-check] Required Vite dependencies are missing. " +
          "Run `npm install` and retry."
        );
      }
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // Development server configuration
  server: {
    host: "::",
    port: 8080,
    // Vite 6: Improved HMR with faster file change detection
    watch: {
      usePolling: false, // Native file watching (faster than polling)
    },
    // Vite 6: Warmup frequently used files for faster initial loads
    warmup: {
      clientFiles: [
        "./src/App.tsx",
        "./src/pages/Index.tsx",
        "./src/components/BottomNav.tsx",
        "./src/components/Header.tsx",
      ],
    },
  },
  // Preview server (production build preview)
  preview: {
    host: "::",
    port: 8080,
  },
  // Vite 6: Optimize dependency pre-bundling
  optimizeDeps: {
    // Include frequently used deps for faster cold starts
    include: [
      "react",
      "react-dom",
      "react-router",
      "@tanstack/react-query",
      "lucide-react",
      "clsx",
      "tailwind-merge",
      "sonner",
    ],
    // Exclude large deps that are rarely used on initial load
    exclude: ["mapbox-gl"],
  },
  // Production build configuration
  build: {
    // Target modern browsers - esbuild requires explicit targets
    // Vite 6 defaults: Chrome 107+, Firefox 104+, Safari 16+, Edge 107+
    target: ["es2022", "chrome107", "firefox104", "safari16", "edge107"],
    // Enable source maps for development builds only
    sourcemap: mode === "development",
    modulePreload: {
      polyfill: true,
      // Aggressively preload critical path chunks to reduce 8.8s chain latency
      resolveDependencies: (filename, deps, { hostId, hostType }) => {
        // Critical chunks needed for first paint - preload ALL of these
        const criticalChunks = [
          'vendor-react',
          'vendor-router', 
          'vendor-query',
          'supabase',
          'ui-core',
          'forms',
          'theme',
          'index',
          'toasts', // Needed for error handling
        ];
        
        // Lazy chunks to NEVER preload - loaded on demand only
        const lazyChunks = [
          'mapbox',
          'MapboxHeatmap',
          'sentry',
          'charts',
          'recharts',
          'd3',
          'ui-dialogs',
          'animations',
          'mapbox-deps',
          'admin', // Admin pages are lazy loaded
        ];
        
        // For the main entry point, preload all critical chunks
        if (filename.includes('index') || filename.includes('main')) {
          return deps.filter(dep => {
            const depName = dep.toLowerCase();
            // Never preload lazy chunks
            if (lazyChunks.some(lazy => depName.includes(lazy.toLowerCase()))) {
              return false;
            }
            // Always preload critical chunks
            if (criticalChunks.some(critical => depName.includes(critical.toLowerCase()))) {
              return true;
            }
            // Preload CSS files
            if (depName.endsWith('.css')) {
              return true;
            }
            // Preload small utility chunks
            return depName.includes('date-utils') || 
                   depName.includes('icons') ||
                   depName.includes('ui-');
          });
        }
        
        // For other chunks, be more conservative
        return deps.filter(dep => {
          const depName = dep.toLowerCase();
          // Exclude lazy chunks
          if (lazyChunks.some(lazy => depName.includes(lazy.toLowerCase()))) {
            return false;
          }
          // Only preload core vendors and CSS
          return criticalChunks.slice(0, 4).some(c => depName.includes(c.toLowerCase())) ||
                 depName.endsWith('.css');
        });
      },
    },
    // Optimize chunk splitting for better caching and reduced unused JS
    rollupOptions: {
      // Externalize mapbox-gl - load from CDN instead of bundling (saves ~448KB)
      external: mode === 'production' ? ['mapbox-gl'] : [],
      output: {
        // Map externalized modules to their global variable names
        globals: {
          'mapbox-gl': 'mapboxgl',
        },
        manualChunks: (id) => {
          // Core React - always needed, load first
          if (id.includes('react-dom') || id.includes('react/') || id.includes('/react/')) {
            return 'vendor-react';
          }
          // React Router - needed for navigation
          if (id.includes('react-router')) {
            return 'vendor-router';
          }
          // TanStack Query - data fetching
          if (id.includes('@tanstack/react-query')) {
            return 'vendor-query';
          }
          // Supabase - split into separate chunk, needed early for auth
          if (id.includes('@supabase/supabase-js') || id.includes('@supabase/')) {
            return 'supabase';
          }
          // Sentry - error monitoring, deferred loading (loaded on user interaction)
          if (id.includes('@sentry/')) {
            return 'sentry';
          }
          // Mapbox geometry deps - keep separate from charts to avoid initialization issues
          // Note: mapbox-gl itself is externalized to CDN in production
          const isMapboxDep =
            id.includes("martinez-polygon-clipping") ||
            id.includes("robust-predicates") ||
            id.includes("splaytree") ||
            id.includes("tinyqueue") ||
            id.includes("delaunator");

          if (isMapboxDep) {
            return "mapbox-deps";
          }

          // Recharts + D3 are only used in the admin analytics view.
          // IMPORTANT: Do not force them into a dedicated vendor chunk.
          // In some builds, splitting these ESM modules can lead to initialization-order issues
          // (e.g. "Cannot access 'S' before initialization" in the generated charts chunk).
          // Let Vite/Rollup decide optimal chunking so these modules stay co-located with their entry.

          // Dialogs - lazy loaded on user interaction
          if (id.includes('@radix-ui/react-dialog') || id.includes('@radix-ui/react-alert-dialog')) {
            return 'ui-dialogs';
          }
          // Form handling - needed for auth and settings
          if (id.includes('react-hook-form') || id.includes('@hookform') || id.includes('zod')) {
            return 'forms';
          }
          // Sonner/toast - frequently used but can defer
          if (id.includes('sonner')) {
            return 'toasts';
          }
          // Date utilities - used across the app
          if (id.includes('date-fns')) {
            return 'date-utils';
          }
          // Lucide icons - split from main bundle (tree-shaken but still notable)
          if (id.includes('lucide-react')) {
            return 'icons';
          }
          // Next-themes - small but separate for clarity
          if (id.includes('next-themes')) {
            return 'theme';
          }
          // Framer motion / animations
          if (id.includes('framer-motion')) {
            return 'animations';
          }
          // Split remaining Radix UI into smaller chunks by usage frequency
          // Menus - dropdowns, selects (common)
          if (id.includes('@radix-ui/react-select') || id.includes('@radix-ui/react-dropdown-menu')) {
            return 'ui-menus';
          }
          // Overlays - tooltips, popovers (common)
          if (id.includes('@radix-ui/react-tooltip') || id.includes('@radix-ui/react-popover')) {
            return 'ui-overlays';
          }
          // Panels - tabs, accordion (common)
          if (id.includes('@radix-ui/react-tabs') || id.includes('@radix-ui/react-accordion')) {
            return 'ui-panels';
          }
          // Form inputs - switch, checkbox, radio (settings/forms)
          if (id.includes('@radix-ui/react-switch') || id.includes('@radix-ui/react-checkbox') || id.includes('@radix-ui/react-radio-group')) {
            return 'ui-inputs';
          }
          // Toast radix - group with sonner
          if (id.includes('@radix-ui/react-toast')) {
            return 'toasts';
          }
          // Other Radix UI components
          if (id.includes('@radix-ui')) {
            return 'ui-core';
          }
        },
      },
    },
    // Vite 6: Use default browser targets (baseline-widely-available)
    // Removed explicit target array - Vite 6 defaults are better optimized
    // Previous: target: ['es2022', 'chrome100', 'firefox100', 'safari15'],
    
    // Increase chunk size warning limit
    chunkSizeWarningLimit: 600,
    // Enable minification with esbuild (default and fastest)
    minify: "esbuild",
    // Vite 6: CSS minification enabled by default for all builds
    cssMinify: "esbuild",
    // Enable tree shaking (always on in production)
    treeshake: true,
  },
  // CSS configuration
  css: {
    // Vite 6: DevSourcemap for better debugging in development
    devSourcemap: mode === "development",
    postcss: {
      plugins: [
        cssnano({
          preset: ['default', {
            discardComments: { removeAll: true },
            normalizeWhitespace: true,
            colormin: false, // Disable to preserve HSL color values
            reduceIdents: false,
            mergeRules: true,
            calc: false, // Preserve calc() and clamp() functions
          }],
        }),
      ],
    },
  },
  // Vite 6: JSON handling improvements
  json: {
    // Auto-stringify large JSON files for better performance
    stringify: "auto",
    namedExports: true,
  },
  plugins: [
    jetViteIntegrationCheck(),
    react(),
    mode === "development" && componentTagger(),
    // DISABLED: CSS preload causes FOUC - keep stylesheet blocking for instant styling
    // The critical CSS is inlined in index.html, so the full stylesheet can load normally
    // {
    //   name: 'css-preload',
    //   transformIndexHtml(html: string) {
    //     if (mode === 'development') return html;
    //     return html.replace(
    //       /<link rel="stylesheet" crossorigin href="(\/assets\/[^"]+\.css)">/g,
    //       '<link rel="preload" as="style" href="$1" onload="this.onload=null;this.rel=\'stylesheet\'">' +
    //       '<noscript><link rel="stylesheet" href="$1"></noscript>'
    //     );
    //   },
    // },
    // Critters CSS extraction is DISABLED.
    // Using preload:'swap' caused the Header and BottomNav stylesheet rules to be
    // deferred, making the nav elements invisible on first production load.
    // The critical layout variables and nav shell styles are now inlined directly
    // in index.html, so Critters is not needed for above-the-fold correctness.
    // mode === 'production' && { name: 'critters-plugin', ... },
    VitePWA({
      registerType: "autoUpdate",
      // Defer service worker registration to avoid render-blocking
      injectRegister: null,
      includeAssets: ["favicon.ico", "robots.txt", "jet-email-logo.png"],
      manifest: {
        name: "JET - Discover What's Hot",
        short_name: "JET",
        description: "Find trending venues, live events, and exclusive deals with real-time heatmaps",
        theme_color: "#000000",
        background_color: "#000000",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/",
        icons: [
          {
            src: "/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webp,woff,woff2,jpg,jpeg}"],
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/^\/api/, /^\/functions/],
        // Stability: don't force-activate and claim clients (can create controller churn)
        skipWaiting: false,
        clientsClaim: false,
        cleanupOutdatedCaches: true,
runtimeCaching: [
          // Cache all /assets/* files with immutable-like behavior
          // This bypasses the CDN's missing cache headers
          {
            urlPattern: /^https:\/\/[^/]+\/assets\/.+\.(js|css|woff|woff2|png|jpg|jpeg|webp|svg|ico)$/i,
            handler: "CacheFirst",
            options: {
              cacheName: "static-assets-cache",
              expiration: { 
                maxEntries: 200, 
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year - assets have content hashes
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Mapbox API (styles, fonts, glyphs) - NetworkFirst for freshness, fallback to cache offline
            urlPattern: /^https:\/\/api\.mapbox\.com\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "mapbox-api-cache",
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
              networkTimeoutSeconds: 3, // Fall back to cache if network is slow
            },
          },
          {
            // Mapbox tiles from main domain - CacheFirst for speed, works offline
            urlPattern: /^https:\/\/tiles\.mapbox\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "mapbox-tiles-cache",
              expiration: { maxEntries: 2000, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Mapbox tiles from subdomains (a, b, c, d) - CacheFirst for offline
            urlPattern: /^https:\/\/[a-d]\.tiles\.mapbox\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "mapbox-tiles-cache",
              expiration: { maxEntries: 2000, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Supabase API - no longer needed for fonts since self-hosted
            urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/v1\/.*/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "supabase-api-cache",
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 5 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/.*\.(png|jpg|jpeg|webp|gif|svg)$/i,
            handler: "CacheFirst",
            options: {
              cacheName: "external-images-cache",
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "supabase-storage-cache",
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
    // Bundle analyzer - generates stats.html in project root after build
    mode === "production" && visualizer({
      filename: "stats.html",
      open: false,
      gzipSize: true,
      brotliSize: true,
      template: "treemap", // Options: sunburst, treemap, network
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime"],
  },
}));
