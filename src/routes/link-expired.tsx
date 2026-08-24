import { createFileRoute } from "@tanstack/react-router";
import LinkExpired from "@/pages/LinkExpired";

const title = "Link expired — JET";
const description =
  "Your password reset or email verification link is no longer valid. Request a new one in one click.";

type LinkExpiredSearch = {
  /** Supabase `error_code`, e.g. `otp_expired`. */
  reason?: string;
  /** Which email flow the dead link belonged to. */
  flow?: "recovery" | "signup";
  /** Prefills the resend form when we already know the address. */
  email?: string;
};

export const Route = createFileRoute("/link-expired")({
  validateSearch: (search: Record<string, unknown>): LinkExpiredSearch => ({
    ...(typeof search.reason === "string" ? { reason: search.reason } : {}),
    ...(search.flow === "signup" || search.flow === "recovery"
      ? { flow: search.flow }
      : {}),
    ...(typeof search.email === "string" ? { email: search.email } : {}),
  }),
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
  component: LinkExpired,
});
