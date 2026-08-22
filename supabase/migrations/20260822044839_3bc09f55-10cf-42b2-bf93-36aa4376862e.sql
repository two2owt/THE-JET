-- idempotency-check: allow-dml
SELECT public.check_email_queue_health();
