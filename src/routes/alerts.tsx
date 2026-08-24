import { SITE_URL } from "@/lib/seo";
import { createFileRoute } from "@tanstack/react-router";
import Alerts from "@/pages/Alerts";

const title = "Your Alerts — JET";
const description =
  "Deal drops, trending venues, and event alerts sent to you, all in one place.";

const CANONICAL_URL = `${SITE_URL}/alerts`;

export const Route = createFileRoute("/alerts")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { property: "og:url", content: CANONICAL_URL },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex, nofollow" },
    ],
    links: [{ rel: "canonical", href: CANONICAL_URL }],
  }),
  component: Alerts,
});
