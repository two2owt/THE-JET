import { SITE_URL } from "@/lib/seo";
import { createFileRoute } from "@tanstack/react-router";
import Auth from "@/pages/Auth";

const title = "Sign In or Create an Account — JET";
const description =
  "Sign in to JET to discover live deals and trending venues near you.";

const CANONICAL_URL = `${SITE_URL}/auth`;

export const Route = createFileRoute("/auth/")({
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
