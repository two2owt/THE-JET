-- 1. Repair check_connection_rate_limit(): the previous body used an invalid
--    pg_advisory_xact_lock(bigint, integer) signature. Use the single-bigint form.
CREATE OR REPLACE FUNCTION public.check_connection_rate_limit(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  request_count integer;
  rate_limit integer := 10;
  time_window interval := '1 hour';
BEGIN
  IF _user_id IS NULL THEN
    RETURN false;
  END IF;

  -- Serialize concurrent rate-limit checks for the same user within the
  -- transaction so parallel inserts cannot race past the limit.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('connection_rate_limit:' || _user_id::text, 0)
  );

  SELECT COUNT(*) INTO request_count
  FROM user_connections
  WHERE user_id = _user_id
    AND created_at > NOW() - time_window;

  RETURN request_count < rate_limit;
END;
$function$;

-- 2. Reusable preflight: verifies every advisory-lock call inside public
--    routines resolves to a real pg_advisory_* signature.
CREATE OR REPLACE FUNCTION public.preflight_check_advisory_locks()
RETURNS TABLE(routine_name text, problem text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT p.proname::text,
         'advisory lock call uses an invalid or unresolvable signature'::text
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    -- The two-argument advisory lock form is only valid as (integer, integer).
    -- hashtext*/bigint expressions used as the first of two args are invalid.
    AND p.prosrc ~* 'pg_advisory_(xact_)?lock(_shared)?\s*\(\s*(pg_catalog\.)?hashtext(extended)?\s*\([^()]*\)\s*,'
  ORDER BY 1;
END;
$function$;

REVOKE ALL ON FUNCTION public.preflight_check_advisory_locks() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preflight_check_advisory_locks() TO service_role;

-- 3. Run the preflight now: fail this migration loudly rather than letting a
--    broken advisory-lock signature reach Live and stall a deploy.
DO $$
DECLARE
  bad text;
BEGIN
  SELECT string_agg(routine_name, ', ')
  INTO bad
  FROM public.preflight_check_advisory_locks();

  IF bad IS NOT NULL THEN
    RAISE EXCEPTION
      'Migration preflight failed: invalid pg_advisory_xact_lock signature in: %', bad;
  END IF;
END
$$;