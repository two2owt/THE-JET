import { createFileRoute } from "@tanstack/react-router";
import CharlotteHappyHour from "@/pages/guides/CharlotteHappyHour";

const title = "Best Happy Hours in Charlotte, NC (2026 Guide)";
const description =
  "A local guide to the best happy hour deals in Charlotte — Uptown, South End, NoDa, and Plaza Midwood, updated in real time.";

export const Route = createFileRoute("/guides/charlotte-happy-hour")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CharlotteHappyHour,
});
