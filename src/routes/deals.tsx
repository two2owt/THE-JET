import { SITE_URL } from "@/lib/seo";
import { createFileRoute } from "@tanstack/react-router";
import Deals from "@/pages/Deals";

const title = "Live Deals & Happy Hours Near You — JET";
const description =
  "Browse tonight's live deals, happy hours, and specials from Charlotte venues, sorted by distance and your taste preferences.";

const CANONICAL_URL = `${SITE_URL}/deals`;

export const Route = createFileRoute("/deals")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { property: "og:url", content: CANONICAL_URL },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: CANONICAL_URL }],
  }),
  component: Deals,
});
