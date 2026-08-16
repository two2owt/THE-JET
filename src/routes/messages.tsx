import { createFileRoute } from "@tanstack/react-router";
import Messages from "@/pages/Messages";

const title = "Messages — JET";
const description = "Chat with your crew and share venues and deals directly in JET.";

export const Route = createFileRoute("/messages")({
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
  component: Messages,
});
