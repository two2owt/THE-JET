import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;
const ENDPOINT = `${SUPABASE_URL}/functions/v1/get-movement-paths`;

// Must match the snapToGrid default in index.ts
const GRID_SIZE = 0.001;
const FORBIDDEN_KEYS = [
  "user_id", "userId", "user", "users", "email", "phone",
  "display_name", "name", "accuracy", "raw", "device_id", "ip",
];
const FORBIDDEN_MARKERS = [/\bmock\b/i, /\bfake\b/i, /\bseed(ed)?\b/i, /\bsample\b/i, /\bdummy\b/i, /\bplaceholder\b/i];

async function fetchPaths(params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString();
  const url = qs ? `${ENDPOINT}?${qs}` : ENDPOINT;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      "apikey": SUPABASE_ANON_KEY,
    },
  });
  const text = await res.text();
  assertEquals(res.status, 200, `Unexpected status ${res.status}: ${text}`);
  return { json: JSON.parse(text), text };
}

function assertNoForbiddenKeys(node: unknown, path = "$"): void {
  if (Array.isArray(node)) {
    node.forEach((v, i) => assertNoForbiddenKeys(v, `${path}[${i}]`));
    return;
  }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      // `unique_users` is an aggregate count, which is allowed.
      if (k === "unique_users") continue;
      assert(
        !FORBIDDEN_KEYS.includes(k),
        `Forbidden PII key '${k}' found in movement-paths response at ${path}`,
      );
      assertNoForbiddenKeys(v, `${path}.${k}`);
    }
  }
}

Deno.test("movement-paths endpoint never returns mock/seed markers", async () => {
  const { text } = await fetchPaths({ time_filter: "all" });
  for (const re of FORBIDDEN_MARKERS) {
    assert(!re.test(text), `Mock/seed marker matching ${re} found in movement-paths response`);
  }
});

Deno.test("movement-paths endpoint never returns PII or per-user identifiers", async () => {
  const { json } = await fetchPaths({ time_filter: "all" });
  assertNoForbiddenKeys(json);
});

Deno.test("movement-paths endpoint returns only grid-snapped (anonymized) coordinates", async () => {
  const { json } = await fetchPaths({ time_filter: "all" });
  const features = json?.geojson?.features ?? [];
  for (const f of features) {
    const coords = f.geometry.coordinates as [number, number][];
    for (const [lng, lat] of coords) {
      const latRatio = lat / GRID_SIZE;
      const lngRatio = lng / GRID_SIZE;
      const latOk = Math.abs(latRatio - Math.round(latRatio)) < 1e-4;
      const lngOk = Math.abs(lngRatio - Math.round(lngRatio)) < 1e-4;
      assert(
        latOk && lngOk,
        `Non-anonymized coordinate leaked: [${lng}, ${lat}] is not snapped to ${GRID_SIZE} grid`,
      );
    }
  }
});