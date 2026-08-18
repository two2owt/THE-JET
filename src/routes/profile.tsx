import { createFileRoute } from "@tanstack/react-router";
import Profile from "@/pages/Profile";

const title = "Your Profile — JET";
const description =
  "Manage your JET profile, preferences, notifications, and privacy settings.";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Profile,
});
