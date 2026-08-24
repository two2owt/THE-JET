// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

// Stable id for this build: the deployment commit when available, otherwise a
// build timestamp. Client and server bundles are built together, so both get
// the same value — the client compares it against /api/public/version to know
// when a newer version has shipped.
const buildId =
  process.env["VERCEL_GIT_COMMIT_SHA"] ??
  process.env["LOVABLE_BUILD_ID"] ??
  process.env["GITHUB_SHA"] ??
  Date.now().toString(36);

// Human-readable release version for Sentry. Falls back to the build id so
// every release is tagged even when no git SHA is available.
const releaseVersion = process.env["VITE_APP_VERSION"] ?? buildId;

// Server routes (email queue/webhook) need non-VITE_ env vars at runtime.
// These are only assigned to process.env — never exposed to the client bundle.
Object.assign(process.env, loadEnv(process.env.NODE_ENV ?? "development", rootDir, ""));

// Source-map upload is gated on the Sentry auth token so local dev builds and
// PRs from forks do not fail when the secret is unavailable.
const sentryAuthToken = process.env["SENTRY_AUTH_TOKEN"];
const enableSentrySourceMaps =
  Boolean(sentryAuthToken) && process.env["NODE_ENV"] !== "test";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    define: {
      __APP_BUILD_ID__: JSON.stringify(buildId),
      "import.meta.env.VITE_APP_VERSION": JSON.stringify(releaseVersion),
    },
    build: {
      // Generate source maps for production so Sentry can symbolicate stacks.
      // `hidden` keeps the `//# sourceMappingURL` comment out of shipped JS,
      // avoiding browser-network fetch attempts for maps that live in Sentry.
      sourcemap: enableSentrySourceMaps ? "hidden" : true,
    },
    resolve: {
      alias: {
        "entities/lib/decode.js": path.resolve(rootDir, "node_modules/entities/lib/decode.js"),
        "entities/lib/encode.js": path.resolve(rootDir, "node_modules/entities/lib/encode.js"),
        entities: path.resolve(rootDir, "node_modules/entities"),
      },
    },
    plugins: enableSentrySourceMaps
      ? [
          sentryVitePlugin({
            authToken: sentryAuthToken,
            org: "creative-breakroom-llc-s2",
            project: "jet-around",
            release: { name: releaseVersion },
            // Only upload the browser bundle source maps; the server bundle is
            // built by nitro and its maps are not useful for client stack traces.
            sourcemaps: {
              assets: [path.resolve(rootDir, "dist/client/**")],
              ignore: ["dist/server/**", "node_modules/**"],
            },
          }),
        ]
      : [],
  },
});
