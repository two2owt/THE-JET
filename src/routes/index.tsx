import { createFileRoute } from "@tanstack/react-router";
import Index from "@/pages/Index";

const TITLE = "JET — Find Live Deals & Events Near You in Charlotte";
const DESCRIPTION =
  "Discover trending venues, live events, and exclusive happy-hour deals across Charlotte on a real-time heatmap. Your guide to what's hot right now.";
const URL = "https://www.jet-around.com";

export const Route = createFileRoute("/")({
  component: HomeRoute,
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: URL },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: URL }],
  }),
});

function HomeRoute() {
  return (
    <>
      <h1 className="sr-only">
        JET — Real-time heatmap of live deals, events, and trending venues near you
      </h1>
      <Index />
    </>
  );
}