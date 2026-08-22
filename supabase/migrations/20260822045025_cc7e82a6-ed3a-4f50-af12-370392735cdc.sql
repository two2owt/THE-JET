-- idempotency-check: allow-dml
-- deal_shares is deny-listed in scripts/realtime-publication-expected.txt and must
-- NEVER be a member of the supabase_realtime publication.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'deal_shares'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.deal_shares;
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

DELETE FROM public.realtime_guard_allowlist WHERE table_name = 'deal_shares';

UPDATE public.realtime_guard_alerts
   SET status = 'resolved', resolved_at = now(), updated_at = now()
 WHERE status = 'open' AND target = 'deal_shares';
