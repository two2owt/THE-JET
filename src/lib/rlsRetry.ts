import { supabase } from "@/integrations/supabase/client";

type PgError = { code?: string; message?: string } | null;

/**
 * True when Postgres rejected the write because RLS could not match the row
 * to the caller — in practice this is almost always a stale/invalid JWT whose
 * `sub` claim no longer resolves, so `auth.uid()` is NULL at write time.
 */
export const isRlsViolation = (error: PgError): boolean => {
  if (!error) return false;
  return (
    error.code === "42501" ||
    /row-level security/i.test(error.message ?? "") ||
    /JWT|missing sub claim/i.test(error.message ?? "")
  );
};

/**
 * Runs a Supabase write and, if it fails with an RLS violation, force-refreshes
 * the session once and retries. A genuinely expired/broken session cannot be
 * refreshed, so we surface the original error instead of looping.
 */
export const withRlsRetry = async <T extends { error: PgError }>(
  run: () => Promise<T>,
): Promise<T> => {
  const first = await run();
  if (!isRlsViolation(first.error)) return first;

  const { data, error } = await supabase.auth.refreshSession();
  if (error || !data.session?.user?.id) return first;

  return run();
};
