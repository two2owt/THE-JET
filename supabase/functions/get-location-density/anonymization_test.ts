import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;
const ENDPOINT = `${SUPABASE_URL}/functions/v1/get-location-density`;

// Must match the server-side grid in index.ts
const GRID_SIZE = 0.003;
// Allowed PII / mock markers — if any of these appear in the response, fail.
const FORBIDDEN_KEYS = [
  "user_id", "userId", "user", "email", "phone", "display_name",
  "name", "accuracy", "raw", "device_id", "ip",
];
const FORBIDDEN_MARKERS = [/\bmock\b/i, /\bfake\b/i, /\bseed(ed)?\b/i, /\bsample\b/i, /\bdummy\b/i, /\bplaceholder\b/i];

async function fetchDensity(body: Record<string, unknown> = {}) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      "apikey": SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
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
      assert(
        !FORBIDDEN_KEYS.includes(k),
        `Forbidden PII key '${k}' found in density response at ${path}`,
      );
      assertNoForbiddenKeys(v, `${path}.${k}`);
    }
  }
}

Deno.test("density endpoint never returns mock/seed markers in payload", async () => {
  const { text } = await fetchDensity({ time_filter: "all" });
  for (const re of FORBIDDEN_MARKERS) {
    assert(!re.test(text), `Mock/seed marker matching ${re} found in density response`);
  }
});

Deno.test("density endpoint never returns PII or raw user fields", async () => {
  const { json } = await fetchDensity({ time_filter: "all" });
  assertNoForbiddenKeys(json);
});

Deno.test("density endpoint returns only grid-snapped (anonymized) coordinates", async () => {
  const { json } = await fetchDensity({ time_filter: "all" });
  const features = json?.geojson?.features ?? [];
  for (const f of features) {
    const [lng, lat] = f.geometry.coordinates;
    // A raw GPS fix would have ~6+ decimal places. Grid cells are integer
    // multiples of GRID_SIZE, so (value / GRID_SIZE) must be an integer.
    const latRatio = lat / GRID_SIZE;
    const lngRatio = lng / GRID_SIZE;
    const latOk = Math.abs(latRatio - Math.round(latRatio)) < 1e-6;
    const lngOk = Math.abs(lngRatio - Math.round(lngRatio)) < 1e-6;
    assert(
      latOk && lngOk,
      `Non-anonymized coordinate leaked: [${lng}, ${lat}] is not snapped to ${GRID_SIZE} grid`,
    );
  }
});