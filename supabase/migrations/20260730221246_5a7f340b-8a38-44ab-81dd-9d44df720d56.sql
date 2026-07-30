-- Self-healing helper: guarantees the pgmq wake triggers exist and point at
-- public.email_queue_wake(). Call this at the end of any migration that touches
-- email queue infrastructure. Safe to run repeatedly.
CREATE OR REPLACE FUNCTION public.ensure_email_queue_triggers()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  spec record;
  existing_fn text;
BEGIN
  FOR spec IN
    SELECT * FROM (VALUES
      ('email_queue_wake_auth', 'pgmq.q_auth_emails'),
      ('email_queue_wake_transactional', 'pgmq.q_transactional_emails')
    ) AS t(trigger_name, table_name)
  LOOP
    IF to_regclass(spec.table_name) IS NULL THEN
      CONTINUE;
    END IF;

    SELECT p.proname INTO existing_fn
    FROM pg_catalog.pg_trigger tg
    JOIN pg_catalog.pg_proc p ON p.oid = tg.tgfoid
    WHERE tg.tgname = spec.trigger_name
      AND tg.tgrelid = to_regclass(spec.table_name)
      AND NOT tg.tgisinternal;

    IF existing_fn IS NULL THEN
      EXECUTE format(
        'CREATE TRIGGER %I AFTER INSERT ON %s FOR EACH STATEMENT EXECUTE FUNCTION public.email_queue_wake()',
        spec.trigger_name, spec.table_name
      );
    ELSIF existing_fn <> 'email_queue_wake' THEN
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON %s', spec.trigger_name, spec.table_name);
      EXECUTE format(
        'CREATE TRIGGER %I AFTER INSERT ON %s FOR EACH STATEMENT EXECUTE FUNCTION public.email_queue_wake()',
        spec.trigger_name, spec.table_name
      );
    END IF;

    existing_fn := NULL;
  END LOOP;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.ensure_email_queue_triggers() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_email_queue_triggers() TO service_role;

SELECT public.ensure_email_queue_triggers();
