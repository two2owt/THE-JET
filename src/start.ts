import {
  createStart,
  createCsrfMiddleware,
  createMiddleware,
} from "@tanstack/react-start";

import { attachSupabaseAuth } from "./integrations/supabase/auth-attacher";
import { renderErrorPage } from "./lib/error-page";

// Consolidate SEO authority on the primary host: permanently redirect the
// www subdomain to the apex domain (jet-around.com), which is what every
// canonical tag, og:url, and sitemap entry advertises.
const canonicalHostMiddleware = createMiddleware().server(
  async ({ next, request }) => {
    try {
      const url = new URL(request.url);
      if (url.hostname === "www.jet-around.com") {
        url.hostname = "jet-around.com";
        return new Response(null, {
          status: 301,
          headers: {
            location: url.toString(),
            "cache-control": "public, max-age=3600",
          },
        });
      }
    } catch {
      // Malformed URL — fall through to normal handling.
    }
    return await next();
  },
);

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Start installs this automatically when src/start.ts is absent; defining the
// file opts out, so re-add it explicitly to keep server functions protected
// from cross-site requests.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  requestMiddleware: [canonicalHostMiddleware, errorMiddleware, csrfMiddleware],
  functionMiddleware: [attachSupabaseAuth],
}));
