import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

/**
 * Sentinel test: any edge function whose name suggests it returns
 * heatmap / grid / density / movement / location data MUST ship with
 * an `anonymization_test.ts` file alongside its `index.ts`.
 *
 * Add the keyword to ALLOWLIST only if the function does not expose
 * coordinates in its response (e.g. push senders that read locations
 * server-side but never echo them).
 */
const KEYWORDS = [
  "heatmap", "heat-map",
  "grid",
  "density",
  "movement",
  "location",
  "geo", // geofence, geo-density, etc.
];

const ALLOWLIST = new Set<string>([
  // Reads user_locations for proximity push, never returns coordinates.
  "send-push-notification",
  "send-web-push",
  "merchant-send-notification",
  // Auth-gated; echoes only neighborhood polygons + deal venue coords
  // (public merchant data), never the user's submitted GPS fix.
  "check-geofence",
  // Returns Mapbox public token, no user data.
  "get-mapbox-token",
]);

function isLocationRelated(name: string): boolean {
  const lower = name.toLowerCase();
  return KEYWORDS.some((kw) => lower.includes(kw));
}

Deno.test("every location/heatmap edge function ships an anonymization test", async () => {
  const functionsDir = new URL("../", import.meta.url);
  const missing: string[] = [];

  for await (const entry of Deno.readDir(functionsDir)) {
    if (!entry.isDirectory) continue;
    if (entry.name.startsWith("_")) continue;
    if (!isLocationRelated(entry.name)) continue;
    if (ALLOWLIST.has(entry.name)) continue;

    const dir = new URL(`../${entry.name}/`, import.meta.url);
    let hasTest = false;
    for await (const file of Deno.readDir(dir)) {
      if (file.isFile && /anonymization.*test\.ts$/.test(file.name)) {
        hasTest = true;
        break;
      }
    }
    if (!hasTest) missing.push(entry.name);
  }

  assert(
    missing.length === 0,
    `Location-related edge functions missing anonymization_test.ts: ${missing.join(", ")}.\n` +
      `Either add a test that proves the response contains no raw coordinates, ` +
      `PII, or mock markers — or add the function to ALLOWLIST with a justification.`,
  );
});