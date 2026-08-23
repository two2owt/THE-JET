import type { LucideIcon } from "lucide-react";
import { Button } from "./ui/button";

interface SignedOutPreviewProps {
  /** Page-level heading — every signed-out page needs a real <h1>. */
  pageTitle: string;
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
  /** 2–3 short sample rows rendered blurred behind the CTA. */
  samples: { title: string; subtitle: string; meta?: string }[];
}

/**
 * Signed-out gate for /favorites, /social and /messages.
 *
 * Two fixes over the old bare EmptyState:
 *  - the page keeps a real <h1>, so screen readers and the a11y audit see the
 *    same page title signed-out as signed-in;
 *  - a few blurred sample cards sit behind the CTA so the panel previews what
 *    the user unlocks instead of reading as an empty screen.
 *
 * The preview rows are decorative — `aria-hidden` keeps the fake content out
 * of the accessibility tree.
 */
export const SignedOutPreview = ({
  pageTitle,
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  samples,
}: SignedOutPreviewProps) => {
  return (
    <section className="w-full">
      <h1 className="heading-luxe-gradient mb-4">{pageTitle}</h1>

      <div className="relative isolate overflow-hidden rounded-2xl border border-white/5">
        {/* Decorative preview stack */}
        <div
          aria-hidden="true"
          className="flex flex-col gap-3 p-4 blur-[7px] opacity-70 select-none pointer-events-none"
          style={{ filter: "blur(7px)" }}
        >
          {samples.map((sample, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-xl border border-white/5 bg-card/80 p-3"
            >
              <div className="h-12 w-12 flex-shrink-0 rounded-xl bg-gradient-to-br from-primary/30 to-accent/30" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-foreground truncate">
                  {sample.title}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {sample.subtitle}
                </div>
              </div>
              {sample.meta && (
                <div className="rounded-full border border-gold/25 px-2 py-1 text-[10px] text-muted-foreground">
                  {sample.meta}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Scrim + CTA */}
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-background/70 via-background/85 to-background/95 px-5 text-center">
          <div className="max-w-sm">
            <div
              className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full border border-gold/25"
              style={{
                background:
                  "linear-gradient(135deg, hsl(var(--primary) / 0.18), hsl(var(--accent) / 0.18))",
              }}
            >
              <Icon className="h-6 w-6 text-primary" />
            </div>
            <h2 className="heading-luxe-section mb-1.5">{title}</h2>
            <p className="text-sm text-muted-foreground leading-snug">
              {description}
            </p>
            <Button className="mt-4" onClick={onAction}>
              {actionLabel}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default SignedOutPreview;
