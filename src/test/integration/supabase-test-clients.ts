import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const anonKey =
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  process.env.VITE_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const integrationEnvReady = Boolean(url && anonKey && serviceKey);

// Fallbacks keep `createClient()` from throwing "supabaseKey is required" at
// collection time in CI (no integration secrets). Suites that actually need a
// live backend are gated behind `integrationEnvReady` and never issue requests.
const PLACEHOLDER_URL = "http://localhost:54321";
const PLACEHOLDER_KEY = "integration-tests-disabled";

export function adminClient(): SupabaseClient {
  return createClient(url ?? PLACEHOLDER_URL, serviceKey ?? PLACEHOLDER_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function anonClient(): SupabaseClient {
  return createClient(url ?? PLACEHOLDER_URL, anonKey ?? PLACEHOLDER_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type TestUser = {
  id: string;
  email: string;
  password: string;
  client: SupabaseClient;
};

/** Creates a confirmed throwaway auth user and returns a signed-in client. */
export async function createTestUser(label: string): Promise<TestUser> {
  const admin = adminClient();
  const email = `rls-${label}-${randomUUID()}@integration.test`;
  const password = `Pw-${randomUUID()}`;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error("user creation failed");

  const client = anonClient();
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;

  return { id: data.user.id, email, password, client };
}

export async function deleteTestUser(user: TestUser | undefined) {
  if (!user) return;
  await user.client.auth.signOut().catch(() => {});
  await adminClient().auth.admin.deleteUser(user.id).catch(() => {});
}
