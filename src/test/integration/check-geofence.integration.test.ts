import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTestUser,
  deleteTestUser,
  integrationEnvReady,
  type TestUser,
} from "./supabase-test-clients";

/**
 * check-geofence contract tests.
 *
 * Every non-2xx response must use the shared envelope
 *   { success: false, error: string, code: string }
 * with the right status: 401 for auth problems, 400 for bad input, and never
 * a 500 for a client mistake or a misleading "Internal server error" body.
 */
const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const anonKey =
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  process.env.VITE_SUPABASE_ANON_KEY;

const endpoint = `${url}/functions/v1/check-geofence`;

type Called = { status: number; body: any; raw: string };

async function call(
  headers: Record<string, string>,
  body?: string,
): Promise<Called> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: body ?? JSON.stringify({}),
  });
  const raw = await res.text();
  let parsed: any = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    /* asserted below */
  }
  return { status: res.status, body: parsed, raw };
}

/** Asserts the standard error envelope. */
function expectEnvelope(res: Called, status: number, code: string) {
  expect(res.status).toBe(status);
  expect(res.body, `body was not JSON: ${res.raw}`).toBeTruthy();
  expect(res.body).toMatchObject({ success: false, code });
  expect(typeof res.body.error).toBe("string");
  expect(res.body.error.length).toBeGreaterThan(0);
}

const d = integrationEnvReady ? describe : describe.skip;

d("check-geofence error contract", () => {
  let user: TestUser | undefined;
  let token: string | undefined;

  beforeAll(async () => {
    user = await createTestUser("geofence");
    const { data } = await user.client.auth.getSession();
    token = data.session?.access_token;
  }, 30000);

  afterAll(async () => {
    await deleteTestUser(user);
  });

  const authed = () => ({
    apikey: anonKey!,
    Authorization: `Bearer ${token}`,
  });

  describe("unauthenticated / auth failures", () => {
    it("returns 401 UNAUTHORIZED with no Authorization header", async () => {
      expectEnvelope(await call({ apikey: anonKey! }), 401, "UNAUTHORIZED");
    });

    it("returns 401 for a malformed bearer token", async () => {
      expectEnvelope(
        await call({ apikey: anonKey!, Authorization: "Bearer not-a-jwt" }),
        401,
        "UNAUTHORIZED",
      );
    });

    it("returns 401 for a well-formed but invalid JWT", async () => {
      const fake =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
        "eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTAwMDAtMDAwMC0wMDAwMDAwMDAwMDAiLCJleHAiOjE2MDAwMDAwMDB9." +
        "c2lnbmF0dXJl";
      expectEnvelope(
        await call({ apikey: anonKey!, Authorization: `Bearer ${fake}` }),
        401,
        "UNAUTHORIZED",
      );
    });

    it("returns 401 for an empty bearer value", async () => {
      expectEnvelope(
        await call({ apikey: anonKey!, Authorization: "Bearer " }),
        401,
        "UNAUTHORIZED",
      );
    });

    it("auth failures are checked before payload validation", async () => {
      // Bad coordinates AND no session -> must still be 401, not 400.
      const res = await call(
        { apikey: anonKey! },
        JSON.stringify({ latitude: 999, longitude: 999 }),
      );
      expectEnvelope(res, 401, "UNAUTHORIZED");
    });

    it("never returns 500 across unauthenticated shapes", async () => {
      const variants: Record<string, string>[] = [
        {},
        { apikey: anonKey! },
        { Authorization: "Bearer " },
        { Authorization: "Basic abc" },
        { apikey: anonKey!, Authorization: "garbage" },
      ];
      const results = await Promise.all(variants.map((h) => call(h)));
      for (const r of results) expect(r.status).toBeLessThan(500);
    });
  });

  describe("invalid input", () => {
    it("returns 400 INVALID_JSON for a non-JSON body", async () => {
      expectEnvelope(
        await call(authed(), "this is not json"),
        400,
        "INVALID_JSON",
      );
    }, 20000);

    const badCoordinateCases: Array<[string, unknown]> = [
      ["missing coordinates", {}],
      ["latitude as string", { latitude: "35.2", longitude: -80.8 }],
      ["latitude above range", { latitude: 91, longitude: -80.8 }],
      ["latitude below range", { latitude: -91, longitude: -80.8 }],
      ["latitude NaN-ish null", { latitude: null, longitude: -80.8 }],
      ["longitude as string", { latitude: 35.2, longitude: "-80.8" }],
      ["longitude above range", { latitude: 35.2, longitude: 181 }],
      ["longitude below range", { latitude: 35.2, longitude: -181 }],
      ["negative accuracy", { latitude: 35.2, longitude: -80.8, accuracy: -5 }],
      [
        "absurd accuracy",
        { latitude: 35.2, longitude: -80.8, accuracy: 1_000_000 },
      ],
      [
        "accuracy as string",
        { latitude: 35.2, longitude: -80.8, accuracy: "10" },
      ],
    ];

    for (const [label, payload] of badCoordinateCases) {
      it(`returns 400 INVALID_INPUT for ${label}`, async () => {
        const res = await call(authed(), JSON.stringify(payload));
        expectEnvelope(res, 400, "INVALID_INPUT");
        // Regression: a 400 must never claim an internal server error.
        expect(res.body.error).not.toMatch(/internal server error/i);
      }, 20000);
    }

    it("accepts a valid payload without erroring", async () => {
      const res = await call(
        authed(),
        JSON.stringify({ latitude: 35.2271, longitude: -80.8431, accuracy: 25 }),
      );
      expect(res.status).toBe(200);
      expect(res.body?.success).toBe(true);
    }, 30000);

    it("accepts a payload with accuracy omitted", async () => {
      const res = await call(
        authed(),
        JSON.stringify({ latitude: 35.2271, longitude: -80.8431 }),
      );
      expect(res.status).toBe(200);
      expect(res.body?.success).toBe(true);
    }, 30000);
  });
});
