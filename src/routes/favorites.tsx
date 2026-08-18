import { SITE_URL } from "@/lib/seo";
import { createFileRoute } from "@tanstack/react-router";
import Favorites from "@/pages/Favorites";

const title = "Your Saved Venues — JET";
const description =
  "Every venue and deal you have saved on JET, with live open/closed status.";

const CANONICAL_URL = `${SITE_URL}/favorites`;

export const Route = createFileRoute("/favorites")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:url", content: CANONICAL_URL },
    ],
    links: [{ rel: "canonical", href: CANONICAL_URL }],
  }),
  component: Favorites,
});
