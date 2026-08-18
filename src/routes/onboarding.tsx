import { SITE_URL } from "@/lib/seo";
import { createFileRoute } from "@tanstack/react-router";
import Onboarding from "@/pages/Onboarding";

const title = "Set Up Your JET Profile";
const description =
  "Tell JET what you like so your map shows the food, drink, and nightlife you care about.";

const CANONICAL_URL = `${SITE_URL}/onboarding`;

export const Route = createFileRoute("/onboarding")({
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
  component: Onboarding,
});
