// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
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
  Date.now().toString(36);

// Server routes (email queue/webhook) need non-VITE_ env vars at runtime.
// These are only assigned to process.env — never exposed to the client bundle.
Object.assign(process.env, loadEnv(process.env.NODE_ENV ?? "development", rootDir, ""));

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    define: {
      __APP_BUILD_ID__: JSON.stringify(buildId),
    },
    resolve: {
      alias: {
        "entities/lib/decode.js": path.resolve(rootDir, "node_modules/entities/lib/decode.js"),
        "entities/lib/encode.js": path.resolve(rootDir, "node_modules/entities/lib/encode.js"),
        entities: path.resolve(rootDir, "node_modules/entities"),
      },
    },
  },
});
