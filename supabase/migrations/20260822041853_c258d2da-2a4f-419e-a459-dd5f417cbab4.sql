-- deal_shares was created without Data API grants, so every read/write from the
-- app (share tracking, admin analytics, venue activity) failed with a permission
-- error even though RLS policies existed. Grant the privileges the policies assume.
GRANT SELECT, INSERT, DELETE ON public.deal_shares TO authenticated;
GRANT ALL ON public.deal_shares TO service_role;

-- The admin Live Activity Feed subscribes to deal_shares inserts, but the table
-- was never added to the realtime publication, so "Deal shared" events never fired.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'deal_shares'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.deal_shares;
  END IF;
END $$;

-- Keep the realtime guard allowlist in sync so check_realtime_guard() does not
-- open a spurious "unapproved_publication_member" alert.
-- idempotency-check: allow-dml
INSERT INTO public.realtime_guard_allowlist (table_name, sensitivity, note, allow_replica_identity_full)
VALUES (
  'deal_shares',
  'private',
  'Owner + admins only; REPLICA IDENTITY DEFAULT so delete payloads carry the primary key only.',
  false
)
ON CONFLICT (table_name) DO UPDATE
  SET sensitivity = EXCLUDED.sensitivity,
      note = EXCLUDED.note,
      allow_replica_identity_full = EXCLUDED.allow_replica_identity_full;