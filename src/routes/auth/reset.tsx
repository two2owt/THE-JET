import { createFileRoute } from "@tanstack/react-router";
import { AuthAliasRedirect } from "@/components/auth/AuthAliasRedirect";

const title = "Reset Password — JET";
const description = "Continue to JET.";

export const Route = createFileRoute("/auth/reset")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: () => <AuthAliasRedirect to="/reset-password" />,
});
