import { createFileRoute } from "@tanstack/react-router";
import PrivacyPolicy from "@/pages/PrivacyPolicy";

const title = "Privacy Policy — JET";
const description = "How JET collects, uses, retains, and protects your location and account data.";

export const Route = createFileRoute("/privacy-policy")({
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
  component: PrivacyPolicy,
});
