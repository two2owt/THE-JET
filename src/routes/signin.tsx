import { createFileRoute } from "@tanstack/react-router";
import Auth from "@/pages/Auth";

const title = "Sign In — JET";
const description =
  "Sign in to your JET account to see live deals and trending venues near you.";

export const Route = createFileRoute("/signin")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Auth,
});
