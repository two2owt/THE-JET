import { SITE_URL } from "@/lib/seo";
import { createFileRoute } from "@tanstack/react-router";
import VerificationSuccess from "@/pages/VerificationSuccess";

const title = "Email Verified — JET";
const description =
  "Your JET email address is confirmed. Jump back in and start exploring the map.";

const CANONICAL_URL = `${SITE_URL}/verification-success`;

export const Route = createFileRoute("/verification-success")({
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
  component: VerificationSuccess,
});
