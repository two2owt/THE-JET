-- idempotency-check: allow-dml
-- Harden enqueue_email so every app email carries the fields the email API requires.
CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name text, payload jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pgmq', 'public'
AS $function$
DECLARE
  p jsonb := COALESCE(payload, '{}'::jsonb);
  mid text;
BEGIN
  IF NULLIF(p->>'run_id', '') IS NULL THEN
    mid := COALESCE(NULLIF(p->>'message_id', ''), gen_random_uuid()::text);
    p := p
      || jsonb_build_object('message_id', mid)
      || jsonb_build_object('purpose', COALESCE(NULLIF(p->>'purpose', ''), 'transactional'))
      || jsonb_build_object('idempotency_key',
           COALESCE(NULLIF(p->>'idempotency_key', ''),
                    COALESCE(NULLIF(p->>'label', ''), queue_name) || ':' || mid));
  END IF;

  IF NULLIF(p->>'queued_at', '') IS NULL THEN
    p := p || jsonb_build_object('queued_at', to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
  END IF;

  RETURN pgmq.send(queue_name, p);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN pgmq.send(queue_name, p);
END;
$function$;

-- Purge the stale dead-lettered map sync alerts and the old queue probe.
DELETE FROM pgmq.q_transactional_emails_dlq WHERE msg_id IN (3, 4, 5, 6);
