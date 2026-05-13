import { PageLayout } from "@/components/PageLayout";
import { useSearchParams } from "react-router";

/**
 * DEV-only harness used by Playwright visual-regression tests to
 * validate scroll & containment guarantees of PageLayout for the
 * Profile, Settings and Social pages without requiring auth or any
 * Supabase data.
 *
 * It mounts the same `<PageLayout />` shell each real page uses,
 * filled with stress content:
 *   - very long vertical content (forces vertical scroll on <main>)
 *   - intentionally wide / long-string content (would cause horizontal
 *     overflow if containment were broken)
 *   - sidebar-like absolutely positioned panel (would escape parent
 *     if isolation/contain were broken)
 *
 * Variants: ?variant=profile | settings | social  (default: profile)
 */
export default function ContainmentHarness() {
  const [params] = useSearchParams();
  const variant = (params.get("variant") ?? "profile") as
    | "profile"
    | "settings"
    | "social";

  // Ridiculously long unbroken token — proves overflow-wrap works.
  const longToken =
    "supercalifragilisticexpialidocious-".repeat(20) +
    "antidisestablishmentarianism-extremely-long-url-fragment";

  return (
    <PageLayout defaultTab="map" headerConfig={{ hideSearch: true }}>
      <div
        data-testid={`containment-${variant}`}
        className="max-w-4xl mx-auto w-full px-4 py-6 space-y-4"
        style={{ overflowWrap: "anywhere" }}
      >
        <h1 className="text-2xl font-bold">Containment Harness — {variant}</h1>

        {/* Sidebar-like fake panel: should be clipped by PageLayout's
            outer overflow:hidden, never bleed past the viewport. */}
        <aside
          data-testid="fake-sidebar"
          aria-label="fake sidebar"
          style={{
            position: "absolute",
            top: 0,
            right: -2000,
            width: 240,
            height: 400,
            background: "hsl(var(--muted))",
          }}
        >
          off-screen panel
        </aside>

        <p>{longToken}</p>

        {Array.from({ length: 60 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-border/40 bg-card/60 p-4"
          >
            <p className="text-sm">
              Row {i + 1} — {longToken.slice(0, 80)}
            </p>
          </div>
        ))}
      </div>
    </PageLayout>
  );
}