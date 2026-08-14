DO $$
DECLARE v record;
BEGIN
  FOR v IN
    SELECT n.nspname, c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'v' AND n.nspname IN ('public','api')
  LOOP
    EXECUTE format('ALTER VIEW %I.%I SET (security_invoker = on)', v.nspname, v.relname);
  END LOOP;
END $$;