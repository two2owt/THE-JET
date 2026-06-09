/**
 * Standalone verification for the deal facet URL parser.
 * Run with: `bun scripts/verify-deal-filters.ts`
 *
 * Covers: happy path, empty values, malformed values, dedup, round-trip,
 * and filter sync semantics (URL is the single source of truth).
 */
import {
  defaultFilters,
  readFilters,
  writeFilters,
  matchesFilters,
  type Filters,
} from "../src/components/admin/dealFilters";

let passed = 0;
let failed = 0;

function eq<T>(label: string, actual: T, expected: T) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ ${label}\n      expected: ${e}\n      actual:   ${a}`);
  }
}

function group(name: string, fn: () => void) {
  console.log(`\n${name}`);
  fn();
}

/* ------------ readFilters: empty / missing ------------ */
group("readFilters — empty URL yields defaults", () => {
  const f = readFilters(new URLSearchParams(""));
  eq("matches defaultFilters", f, defaultFilters);
});

group("readFilters — unrelated params are ignored", () => {
  const f = readFilters(new URLSearchParams("section=deals&foo=bar"));
  eq("returns defaults", f, defaultFilters);
});

/* ------------ readFilters: happy path ------------ */
group("readFilters — full happy path", () => {
  const url =
    "q=pizza&types=happyhour,bogo&status=active&from=2026-01-01&to=2026-12-31" +
    "&priority=high,low&merchants=m1,m2&neighborhoods=n1&days=0,3,6";
  const f = readFilters(new URLSearchParams(url));
  eq("q", f.q, "pizza");
  eq("types", f.types, ["happyhour", "bogo"]);
  eq("status", f.status, "active");
  eq("from", f.from, "2026-01-01");
  eq("to", f.to, "2026-12-31");
  eq("priority", f.priority, ["high", "low"]);
  eq("merchants", f.merchants, ["m1", "m2"]);
  eq("neighborhoods", f.neighborhoods, ["n1"]);
  eq("days", f.days, [0, 3, 6]);
});

/* ------------ readFilters: malformed / invalid ------------ */
group("readFilters — invalid values are silently dropped", () => {
  const url =
    "status=bogus&priority=high,unicorn,low,low" +
    "&days=-1,0,7,3,abc,3,99,2" +
    "&from=not-a-date&to=2026-13-40" +
    "&types=,a,,b,a, , &merchants= ,x, ,x";
  const f = readFilters(new URLSearchParams(url));
  eq("status falls back to 'all'", f.status, "all");
  eq("priority drops unknown + dedupes", f.priority, ["high", "low"]);
  eq("days drops OOR / NaN / dupes", f.days, [0, 3, 2]);
  eq("from drops malformed", f.from, "");
  eq("to drops invalid calendar date", f.to, "");
  eq("types trims/dedupes/drops empties", f.types, ["a", "b"]);
  eq("merchants trims/dedupes/drops empties", f.merchants, ["x"]);
});

group("readFilters — q is length-capped", () => {
  const long = "x".repeat(500);
  const f = readFilters(new URLSearchParams(`q=${long}`));
  eq("q truncated to 200 chars", f.q.length, 200);
});

/* ------------ writeFilters: serialization & round-trip ------------ */
group("writeFilters — omits defaults, preserves unrelated", () => {
  const base = new URLSearchParams("section=deals&keepme=1");
  const params = writeFilters(base, defaultFilters);
  eq("no facet keys added", params.toString(), "section=deals&keepme=1");
});

group("writeFilters — full round-trip is lossless", () => {
  const original: Filters = {
    q: "tacos",
    types: ["bogo", "happyhour"],
    status: "upcoming",
    from: "2026-02-01",
    to: "2026-02-28",
    priority: ["medium"],
    merchants: ["m-1"],
    neighborhoods: ["n-1", "n-2"],
    days: [1, 2, 5],
  };
  const params = writeFilters(new URLSearchParams("section=deals"), original);
  const parsed = readFilters(params);
  eq("round-trip equals input", parsed, original);
  eq("section preserved", params.get("section"), "deals");
});

group("writeFilters — clearing one facet removes only that key", () => {
  const url = "section=deals&q=hi&status=active&days=1,2";
  const base = new URLSearchParams(url);
  const current = readFilters(base);
  const next = writeFilters(base, { ...current, status: "all" });
  eq("status key removed", next.has("status"), false);
  eq("q preserved", next.get("q"), "hi");
  eq("days preserved", next.get("days"), "1,2");
  eq("section preserved", next.get("section"), "deals");
});

/* ------------ Sidebar sync invariant ------------
 * The sidebar reads `readFilters(searchParams)` on every render and is fully
 * controlled — so any URL mutation by any source (back/forward, paste, deep
 * link) re-renders the sidebar with that exact state. We assert this by
 * round-tripping arbitrary URLs and confirming `readFilters` is idempotent
 * after a write.
 */
group("sidebar sync — readFilters ∘ writeFilters is idempotent", () => {
  const cases = [
    "",
    "q=a",
    "types=x,y,z&status=expired",
    "priority=low&days=0,6&merchants=m",
    "section=deals&q=x&neighborhoods=n1,n2",
  ];
  for (const c of cases) {
    const a = readFilters(new URLSearchParams(c));
    const written = writeFilters(new URLSearchParams(c), a);
    const b = readFilters(written);
    eq(`stable for "${c || "(empty)"}"`, b, a);
  }
});

/* ------------ matchesFilters: invalid filter never crashes ------------ */
group("matchesFilters — invalid filter shapes are safe", () => {
  const deal = {
    id: "d",
    title: "T",
    venue_name: "V",
    description: "D",
    deal_type: "bogo",
    active: true,
    active_days: [1, 2],
    starts_at: "2026-01-01T00:00:00Z",
    expires_at: "2099-01-01T00:00:00Z",
    merchant_id: "m1",
    neighborhood_id: "n1",
    created_at: null,
    updated_at: null,
    image_url: null,
    onboarding_completed_at: null,
    onboarding_started_at: null,
    venue_address: null,
    venue_id: "v",
    website_url: null,
  } as any;
  // Empty filters → always match
  eq("empty filters match", matchesFilters(deal, defaultFilters), true);
  // Mismatched merchant
  eq("merchant mismatch excludes", matchesFilters(deal, { ...defaultFilters, merchants: ["other"] }), false);
  // Day overlap
  eq("any-day overlap includes", matchesFilters(deal, { ...defaultFilters, days: [2, 4] }), true);
  eq("no-day overlap excludes", matchesFilters(deal, { ...defaultFilters, days: [0, 4] }), false);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);