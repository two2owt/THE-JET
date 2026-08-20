import { SITE_URL } from "@/lib/seo";
import { createFileRoute } from "@tanstack/react-router";
import NotificationSettings from "@/pages/NotificationSettings";

const title = "Push Notification Settings — JET";
const description =
  "Turn JET push alerts for deals, favorites and messages on or off. Your choice is saved to your account.";

const CANONICAL_URL = `${SITE_URL}/notification-settings`;

export const Route = createFileRoute("/notification-settings")({
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
  component: NotificationSettings,
});