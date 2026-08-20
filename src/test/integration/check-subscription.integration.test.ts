import { describe, expect, it } from "vitest";
import { createTestUser, integrationEnvReady } from "./supabase-test-clients";

/**
 * check-subscription must answer auth problems with 401 and never a 500.
 * Regression guard for the previous behaviour where a missing/invalid
 * Authorization header bubbled up as an unhandled 500.
 */
const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const anonKey =
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  process.env.VITE_SUPABASE_ANON_KEY;

const endpoint = `${url}/functions/v1/check-subscription`;

async function call(headers: Record<string, string>) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({}),
  });
  return { status: res.status, body: await res.text() };
}

const d = integrationEnvReady ? describe : describe.skip;

d("check-subscription auth contract", () => {
  it("returns 401 when the Authorization header is missing", async () => {
    const res = await call({ apikey: anonKey! });
    expect(res.status).toBe(401);
    expect(res.status).not.toBe(500);
  });

  it("returns 401 for a malformed bearer token", async () => {
    const res = await call({ apikey: anonKey!, Authorization: "Bearer not-a-jwt" });
    expect(res.status).toBe(401);
  });

  it("returns 401 for a well-formed but invalid JWT", async () => {
    const fake =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
      "eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTAwMDAtMDAwMC0wMDAwMDAwMDAwMDAiLCJleHAiOjE2MDAwMDAwMDB9." +
      "c2lnbmF0dXJl";
    const res = await call({ apikey: anonKey!, Authorization: `Bearer ${fake}` });
    expect(res.status).toBe(401);
  });

  it("returns 401 for an empty bearer value", async () => {
    const res = await call({ apikey: anonKey!, Authorization: "Bearer " });
    expect(res.status).toBe(401);
  });

  it("never returns 500 across all unauthenticated shapes", async () => {
    const variants: Record<string, string>[] = [
      {},
      { apikey: anonKey! },
      { Authorization: "Bearer " },
      { Authorization: "Basic abc" },
      { apikey: anonKey!, Authorization: "garbage" },
    ];
    const results = await Promise.all(variants.map((h) => call(h)));
    for (const r of results) {
      expect(r.status).toBeLessThan(500);
    }
  });

  it("does not 401 a valid session", async () => {
    const user = await createTestUser("checksub");
    try {
      const { data } = await user.client.auth.getSession();
      const token = data.session?.access_token;
      expect(token).toBeTruthy();
      const res = await call({ apikey: anonKey!, Authorization: `Bearer ${token}` });
      expect(res.status).not.toBe(401);
      expect(res.status).toBeLessThan(500);
    } finally {
      const { adminClient } = await import("./supabase-test-clients");
      await adminClient().auth.admin.deleteUser(user.id);
    }
  }, 30000);
});
