import { createFileRoute } from "@tanstack/react-router";
import Onboarding from "@/pages/Onboarding";

const title = "Set Up Your JET Profile";
const description = "Tell JET what you like so your map shows the food, drink, and nightlife you care about.";

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
    ],
  }),
  component: Onboarding,
});
