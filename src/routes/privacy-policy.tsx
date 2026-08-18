import { SITE_URL } from "@/lib/seo";
import { createFileRoute } from "@tanstack/react-router";
import PrivacyPolicy from "@/pages/PrivacyPolicy";

const title = "Privacy Policy — JET";
const description =
  "How JET collects, uses, retains, and protects your location and account data.";

const CANONICAL_URL = `${SITE_URL}/privacy-policy`;

export const Route = createFileRoute("/privacy-policy")({
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
  component: PrivacyPolicy,
});
