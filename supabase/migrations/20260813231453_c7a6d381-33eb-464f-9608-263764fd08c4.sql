DO $revoke_anon_definer$
DECLARE
  fn record;
  authenticated_had_execute boolean;
  service_role_had_execute boolean;
BEGIN
  FOR fn IN
    SELECT p.oid, p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.prosecdef
      AND n.nspname IN ('public', 'api')
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    authenticated_had_execute := has_function_privilege('authenticated', fn.oid, 'EXECUTE');
    service_role_had_execute := has_function_privilege('service_role', fn.oid, 'EXECUTE');

    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', fn.signature);

    IF authenticated_had_execute THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn.signature);
    END IF;

    IF service_role_had_execute THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn.signature);
    END IF;
  END LOOP;
END
$revoke_anon_definer$;

ALTER VIEW IF EXISTS public.discoverable_profiles SET (security_invoker = on);
ALTER VIEW IF EXISTS public.profiles_secure SET (security_invoker = on);
ALTER VIEW IF EXISTS public.venue_reviews_public SET (security_invoker = on);