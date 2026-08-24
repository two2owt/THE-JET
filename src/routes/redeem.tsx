import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { SITE_URL } from "@/lib/seo";
import { PageLayout } from "@/components/PageLayout";
import { Skeleton } from "@/components/ui/skeleton";

const RedemptionScanner = lazy(() =>
  import("@/components/redeem/RedemptionScanner").then((m) => ({
    default: m.RedemptionScanner,
  })),
);

const title = "Redeem a JET deal — Merchant scanner";
const description =
  "Merchant staff scan a member's JET QR code to log a deal redemption and update the analytics dashboard instantly.";
const CANONICAL_URL = `${SITE_URL}/redeem`;

export const Route = createFileRoute("/redeem")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:url", content: CANONICAL_URL },
    ],
    links: [{ rel: "canonical", href: CANONICAL_URL }],
  }),
  component: RedeemPage,
});

function RedeemPage() {
  return (
    <PageLayout>
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-6">
        <header className="flex flex-col gap-1">
          <h1 className="font-display text-2xl">Redeem</h1>
          <p className="text-sm text-muted-foreground">
            Scan the member's QR code, or type it in. Every redemption is logged
            for the merchant analytics dashboard.
          </p>
        </header>
        <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
          <RedemptionScanner />
        </Suspense>
      </div>
    </PageLayout>
  );
}
