DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT n.nspname AS s, p.proname AS fn,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.prosecdef AND n.nspname IN ('public','api')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC, anon', f.s, f.fn, f.args);
  END LOOP;
END $$;