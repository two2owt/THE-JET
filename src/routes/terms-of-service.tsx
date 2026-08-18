import { SITE_URL } from "@/lib/seo";
import { createFileRoute } from "@tanstack/react-router";
import TermsOfService from "@/pages/TermsOfService";

const title = "Terms of Service — JET";
const description =
  "The terms that govern your use of the JET real-time deal and venue discovery app.";

const CANONICAL_URL = `${SITE_URL}/terms-of-service`;

export const Route = createFileRoute("/terms-of-service")({
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
  component: TermsOfService,
});
