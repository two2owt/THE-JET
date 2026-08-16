import { createFileRoute } from "@tanstack/react-router";
import TermsOfService from "@/pages/TermsOfService";

const title = "Terms of Service — JET";
const description = "The terms that govern your use of the JET real-time deal and venue discovery app.";

export const Route = createFileRoute("/terms-of-service")({
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
  component: TermsOfService,
});
