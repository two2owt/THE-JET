import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 5,
        gcTime: 1000 * 60 * 30,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Warm route chunks + loader data on hover/touch-intent so tab switches
    // feel instant instead of downloading a chunk on click.
    defaultPreload: "intent",
    defaultPreloadDelay: 50,
    // Reuse preloaded data for 30s instead of refetching immediately on nav.
    defaultPreloadStaleTime: 30_000,
    // Suppress sub-200ms pending fallbacks so fast navigations never flash a
    // skeleton; once shown, keep it up long enough to avoid a strobe.
    defaultPendingMs: 200,
    defaultPendingMinMs: 400,
  });

  return router;
};
