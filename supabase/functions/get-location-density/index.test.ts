// Smoke test for the get-location-density edge function.
// Run with: deno test --allow-env --allow-net --allow-read supabase/functions/get-location-density/index.test.ts
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;
const EXPECTED_PROJECT_ID = Deno.env.get("VITE_SUPABASE_PROJECT_ID")!;
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/get-location-density`;

// Optional credentials for the authenticated leg of the smoke test.
const TEST_EMAIL = Deno.env.get("TEST_USER_EMAIL");
const TEST_PASSWORD = Deno.env.get("TEST_USER_PASSWORD");

Deno.test("env points at the expected Supabase project", () => {
  assert(SUPABASE_URL, "VITE_SUPABASE_URL is missing");
  assert(SUPABASE_ANON_KEY, "VITE_SUPABASE_PUBLISHABLE_KEY is missing");
  assert(EXPECTED_PROJECT_ID, "VITE_SUPABASE_PROJECT_ID is missing");
  assertStringIncludes(SUPABASE_URL, EXPECTED_PROJECT_ID);
});

Deno.test(
  "get-location-density is deployed and rejects anonymous callers",
  async () => {
    const res = await fetch(FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ timeFilter: "today" }),
    });
    const text = await res.text(); // always consume the body
    assertEquals(
      res.status,
      401,
      `expected 401 for anonymous call, got ${res.status}: ${text}`,
    );
  },
);

async function signIn(): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  });
  const json = await res.json();
  assert(
    res.ok && json.access_token,
    `sign-in failed: ${JSON.stringify(json)}`,
  );
  return json.access_token as string;
}

Deno.test({
  name: "signed-in caller receives a well-formed density payload",
  ignore: !TEST_EMAIL || !TEST_PASSWORD,
  fn: async () => {
    const token = await signIn();
    const res = await fetch(FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ timeFilter: "today" }),
    });
    const body = await res.json();
    assertEquals(
      res.status,
      200,
      `expected 200, got ${res.status}: ${JSON.stringify(body)}`,
    );
    assert(
      Array.isArray(body.densityPoints),
      "densityPoints array missing from response",
    );
    // The k-anonymity floor may legitimately empty the grid; the contract is
    // that the shape is present and no raw user identifiers leak.
    assertEquals(
      JSON.stringify(body).includes("user_id"),
      false,
      "response must not expose user_id",
    );
  },
});
