import { SITE_URL } from "@/lib/seo";
import { createFileRoute } from "@tanstack/react-router";
import Auth from "@/pages/Auth";

const title = "Reset Your Password — JET";
const description = "Set a new password and get back into your JET account.";

const CANONICAL_URL = `${SITE_URL}/reset-password`;

export const Route = createFileRoute("/reset-password")({
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
  component: Auth,
});
