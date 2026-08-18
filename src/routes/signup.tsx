import { SITE_URL } from "@/lib/seo";
import { createFileRoute } from "@tanstack/react-router";
import Auth from "@/pages/Auth";

const title = "Create Your JET Account";
const description =
  "Join JET to track live deals, save favorite venues, and get alerts when spots heat up.";

const CANONICAL_URL = `${SITE_URL}/signup`;

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:url", content: CANONICAL_URL },
    ],
    links: [{ rel: "canonical", href: CANONICAL_URL }],
  }),
  component: Auth,
});
