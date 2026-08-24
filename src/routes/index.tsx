import { SITE_URL } from "@/lib/seo";
import { createFileRoute, redirect } from "@tanstack/react-router";
import Index from "@/pages/Index";

const TITLE = "JET — Find Live Deals & Events Near You";
const DESCRIPTION =
  "Discover trending venues and live events near you in your area on a real-time heatmap. Your guide to what's hot right now.";
const URL = SITE_URL;

export const Route = createFileRoute("/")({
  component: HomeRoute,
  // The deals feed and alerts used to live at `/?tab=...`. Keep old links,
  // shared URLs, and push payloads working by forwarding to the real pages.
  beforeLoad: ({ search }) => {
    const tab = (search as Record<string, unknown>)?.tab;
    if (tab === "explore" || tab === "notifications") {
      const { tab: _tab, ...rest } = search as Record<string, unknown>;
      throw redirect({
        to: tab === "explore" ? "/deals" : "/alerts",
        search: rest,
        replace: true,
      });
    }
  },
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: URL },
      { name: "twitter:card", content: "summary_large_image" },
      {
        property: "og:image",
        content: "https://jet-around.com/pwa-512x512.png",
      },
      {
        name: "twitter:image",
        content: "https://jet-around.com/pwa-512x512.png",
      },
    ],
    links: [{ rel: "canonical", href: URL }],
  }),
});

function HomeRoute() {
  // The <h1> lives in <Index /> so it can follow the active tab.
  return <Index />;
}

