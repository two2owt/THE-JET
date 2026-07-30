CREATE OR REPLACE FUNCTION public.email_queue_endpoint()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  base text;
  jwt text;
  seg text;
  ref text;
BEGIN
  base := current_setting('app.settings.supabase_url', true);
  IF base IS NOT NULL AND base <> '' THEN
    RETURN rtrim(base, '/') || '/functions/v1/process-email-queue';
  END IF;

  SELECT decrypted_secret INTO jwt
  FROM vault.decrypted_secrets
  WHERE name = 'email_queue_service_role_key';

  IF jwt IS NULL THEN
    RETURN NULL;
  END IF;

  seg := split_part(jwt, '.', 2);
  seg := replace(replace(seg, '-', '+'), '_', '/');
  seg := seg || repeat('=', (4 - length(seg) % 4) % 4);
  ref := (convert_from(decode(seg, 'base64'), 'utf8')::jsonb) ->> 'ref';

  IF ref IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN 'https://' || ref || '.supabase.co/functions/v1/process-email-queue';
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.email_queue_endpoint() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.email_queue_dispatch()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  endpoint text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pgmq.q_auth_emails)
     AND NOT EXISTS (SELECT 1 FROM pgmq.q_transactional_emails) THEN
    BEGIN
      PERFORM pg_catalog.pg_advisory_xact_lock(7700000000000001);
      IF EXISTS (SELECT 1 FROM pgmq.q_auth_emails)
         OR EXISTS (SELECT 1 FROM pgmq.q_transactional_emails) THEN
        RETURN;
      END IF;
      PERFORM cron.unschedule('process-email-queue');
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'email_queue_dispatch: cron unschedule failed: %', SQLERRM;
    END;
    RETURN;
  END IF;

  IF (SELECT retry_after_until FROM public.email_send_state WHERE id = 1) > now() THEN
    RETURN;
  END IF;

  endpoint := public.email_queue_endpoint();
  IF endpoint IS NULL THEN
    RAISE WARNING 'email_queue_dispatch: no endpoint resolved';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := endpoint,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Lovable-Context', 'cron',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key'
      )
    ),
    body := '{}'::jsonb
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.email_queue_dispatch() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.email_queue_wake()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  endpoint text;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(7700000000000001);
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-email-queue') THEN
    BEGIN
      PERFORM cron.schedule('process-email-queue', '5 seconds', $cron$ SELECT public.email_queue_dispatch(); $cron$);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'email_queue_wake: cron schedule failed: %', SQLERRM;
    END;
  END IF;

  BEGIN
    endpoint := public.email_queue_endpoint();
    IF endpoint IS NOT NULL THEN
      PERFORM net.http_post(
        url := endpoint,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Lovable-Context', 'cron',
          'Authorization', 'Bearer ' || (
            SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key'
          )
        ),
        body := '{}'::jsonb
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'email_queue_wake failed (enqueue preserved): %', SQLERRM;
  RETURN NULL;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.email_queue_wake() FROM PUBLIC, anon, authenticated;