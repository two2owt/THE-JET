/**
 * Resolves Supabase publishable and service-role keys from the new
 * JWT Signing Keys environment variables, with fallbacks to the legacy
 * names so existing deployments keep working during the transition.
 */

function runtimeEnv(name: string): string | undefined {
  return Deno.env.get(name)?.trim();
}

function configuredEnv(names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = runtimeEnv(name);
    if (value) return value;
  }
  return undefined;
}

function parseKeyset(keyset: string, prefix: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(keyset);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const keys = parsed as Record<string, unknown>;
      const key = [keys.default, ...Object.values(keys)]
        .find((v): v is string =>
          typeof v === "string" &&
          v.trim().startsWith(prefix)
        )
        ?.trim();
      if (key) return key;
    }
  } catch {
    // Malformed JSON — fall through to direct keys.
  }
  return undefined;
}

/** Returns the publishable (anon) key for the current project. */
export function getPublishableKey(): string {
  const keyset = runtimeEnv("SUPABASE_PUBLISHABLE_KEYS");
  if (keyset) {
    const parsed = parseKeyset(keyset, "sb_publishable_");
    if (parsed) return parsed;
  }
  const direct = configuredEnv([
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_ANON_KEY",
  ]);
  if (direct) return direct;
  throw new Error(
    "SUPABASE_PUBLISHABLE_KEYS, SUPABASE_PUBLISHABLE_KEY, or SUPABASE_ANON_KEY is required",
  );
}

/** Returns the service-role key for the current project. */
export function getServiceRoleKey(): string {
  const keyset = runtimeEnv("SUPABASE_SECRET_KEYS");
  if (keyset) {
    const parsed = parseKeyset(keyset, "sb_service_");
    if (parsed) return parsed;
  }
  const direct = configuredEnv([
    "SUPABASE_SECRET_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  ]);
  if (direct) return direct;
  throw new Error(
    "SUPABASE_SECRET_KEYS, SUPABASE_SECRET_KEY, or SUPABASE_SERVICE_ROLE_KEY is required",
  );
}
