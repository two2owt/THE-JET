import { SITE_URL } from "@/lib/seo";
import { createFileRoute } from "@tanstack/react-router";
import AdminDashboard from "@/pages/AdminDashboard";

const title = "Admin — JET";
const description =
  "Internal JET admin dashboard for merchant deals, users, and notifications.";

const CANONICAL_URL = `${SITE_URL}/admin`;

export const Route = createFileRoute("/admin")({
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
  component: AdminDashboard,
});
