import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * /pricing is a URL users (and app-store reviewers) guess. The plan grid lives
 * on the account tab of the profile page, so redirect rather than 404.
 */
export const Route = createFileRoute("/pricing")({
  beforeLoad: () => {
    throw redirect({ href: "/profile?tab=account", replace: true });
  },
});
