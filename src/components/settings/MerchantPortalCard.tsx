import { Store, ExternalLink, BadgeCheck, Clock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/** JET Bridge is the merchant portal; deals published there sync to the map via webhook. */
export const MERCHANT_PORTAL_URL = "https://www.jetbridge.partners";
export const MERCHANT_SIGNUP_URL = "https://www.jetlanding.app";

export function MerchantPortalCard() {
  return (
    <Card className="overflow-hidden bg-card/90 backdrop-blur-xl shadow-card border-primary/10 rounded-2xl">
      <header className="px-5 sm:px-7 pt-5 sm:pt-6 pb-4 border-b border-border/40 bg-gradient-to-br from-primary/10 via-transparent to-transparent">
        <div className="flex items-start gap-3">
          <div className="shrink-0 w-9 h-9 rounded-full bg-primary/15 ring-1 ring-primary/30 flex items-center justify-center">
            <Store className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0 space-y-0.5">
            <h2 className="font-display text-lg sm:text-xl font-bold text-foreground tracking-tight">
              For businesses
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Own a venue? List it and post deals on JET Bridge — they appear on the JET map automatically.
            </p>
          </div>
        </div>
      </header>
      <div className="p-5 sm:p-7 space-y-4">
        <ul className="space-y-2 text-xs text-muted-foreground">
          <li className="flex gap-2">
            <BadgeCheck className="w-4 h-4 text-primary shrink-0" />
            Businesses with a registered EIN or state business registration are approved instantly.
          </li>
          <li className="flex gap-2">
            <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
            Others are reviewed by the JET team before going live.
          </li>
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="jet" className="rounded-full font-semibold">
            <a href={MERCHANT_SIGNUP_URL} target="_blank" rel="noopener noreferrer">
              List my business <ExternalLink className="w-4 h-4 ml-2" />
            </a>
          </Button>
          <Button asChild variant="outline" className="rounded-full">
            <a href={MERCHANT_PORTAL_URL} target="_blank" rel="noopener noreferrer">
              Merchant sign in
            </a>
          </Button>
        </div>
      </div>
    </Card>
  );
}
