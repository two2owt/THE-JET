import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * /settings is another commonly guessed URL; account settings live on the
 * profile page's account tab.
 */
export const Route = createFileRoute("/settings")({
  beforeLoad: () => {
    throw redirect({ href: "/profile?tab=account", replace: true });
  },
});
