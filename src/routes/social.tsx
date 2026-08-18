import { createFileRoute } from "@tanstack/react-router";
import Social from "@/pages/Social";

const title = "Your Crew — JET";
const description =
  "Find friends on JET, share deals, and see where your crew is going out.";

export const Route = createFileRoute("/social")({
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
  component: Social,
});
