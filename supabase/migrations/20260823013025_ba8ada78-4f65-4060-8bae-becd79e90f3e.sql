ALTER TABLE public.subscribers REPLICA IDENTITY DEFAULT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'subscribers'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.subscribers;
  END IF;
END $$;

-- idempotency-check: allow-dml
INSERT INTO public.realtime_guard_allowlist
  (table_name, sensitivity, note, allow_replica_identity_full)
VALUES
  ('subscribers', 'private', 'Paywall state. RLS is SELECT-own; replica identity DEFAULT so no billing PII in old payloads.', false)
ON CONFLICT (table_name) DO UPDATE
  SET sensitivity = EXCLUDED.sensitivity,
      note = EXCLUDED.note,
      allow_replica_identity_full = EXCLUDED.allow_replica_identity_full;