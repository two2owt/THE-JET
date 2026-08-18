import { SITE_URL } from "@/lib/seo";
import { createFileRoute } from "@tanstack/react-router";
import CharlotteHappyHour, {
  guideJsonLd,
} from "@/pages/guides/CharlotteHappyHour";

const title = "Best Happy Hours in Charlotte, NC (2026 Guide)";
const description =
  "A local guide to the best happy hour deals in Charlotte — Uptown, South End, NoDa, and Plaza Midwood, updated in real time.";

const CANONICAL_URL = `${SITE_URL}/guides/charlotte-happy-hour`;

export const Route = createFileRoute("/guides/charlotte-happy-hour")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "article" },
      { property: "og:url", content: CANONICAL_URL },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: CANONICAL_URL }],
    scripts: guideJsonLd.map((data) => ({
      type: "application/ld+json",
      children: JSON.stringify(data),
    })),
  }),
  component: CharlotteHappyHour,
});
