-- Idempotently ensure the pgmq wake triggers exist so publish diffs never
-- attempt DROP FUNCTION public.email_queue_wake() (dependent triggers exist in prod).
DO $$
BEGIN
  IF to_regclass('pgmq.q_auth_emails') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = 'email_queue_wake_auth'
        AND tgrelid = 'pgmq.q_auth_emails'::regclass
        AND NOT tgisinternal
    ) THEN
      EXECUTE 'CREATE TRIGGER email_queue_wake_auth AFTER INSERT ON pgmq.q_auth_emails FOR EACH STATEMENT EXECUTE FUNCTION public.email_queue_wake()';
    END IF;
  END IF;

  IF to_regclass('pgmq.q_transactional_emails') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = 'email_queue_wake_transactional'
        AND tgrelid = 'pgmq.q_transactional_emails'::regclass
        AND NOT tgisinternal
    ) THEN
      EXECUTE 'CREATE TRIGGER email_queue_wake_transactional AFTER INSERT ON pgmq.q_transactional_emails FOR EACH STATEMENT EXECUTE FUNCTION public.email_queue_wake()';
    END IF;
  END IF;
END
$$;
