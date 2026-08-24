/**
 * WebSocket polyfill for Node.js SSR environments.
 *
 * Supabase Realtime expects a global `WebSocket` constructor. Browsers and
 * modern edge runtimes provide one, but Node.js SSR (including `vite dev` and
 * CI builds) does not always expose it globally. This module installs the
 * `ws` package as `globalThis.WebSocket` only when needed.
 *
 * This is a *.server.ts module so it never ships to the browser bundle.
 * Import it at the very top of any SSR/server entry before any code that may
 * initialize a Supabase client.
 */

const needsPolyfill =
  typeof globalThis.WebSocket === "undefined" &&
  typeof process !== "undefined" &&
  typeof process.versions?.node === "string";

if (needsPolyfill) {
  const ws = await import("ws");
  const WebSocketCtor =
    ws.WebSocket ??
    (ws as unknown as { default: typeof ws.WebSocket }).default;

  if (typeof WebSocketCtor === "function") {
    (globalThis as unknown as { WebSocket: typeof WebSocketCtor }).WebSocket =
      WebSocketCtor;
  }
}

export {};
