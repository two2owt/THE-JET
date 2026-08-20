-- Security hardening: add missing grants for user-owned tables
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_locations TO authenticated;
GRANT ALL ON public.user_locations TO service_role;

-- Re-assert push_notifications grants (idempotent) after push_subscriptions -> push_notifications rename
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_notifications TO authenticated;
GRANT ALL ON public.push_notifications TO service_role;

-- Ensure suppressed_emails has a locked-down service_role-only policy
DROP POLICY IF EXISTS "service_role_only" ON public.suppressed_emails;
CREATE POLICY "service_role_only" ON public.suppressed_emails
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- §6 deny-list: user_locations must never be published to supabase_realtime
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'user_locations'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.user_locations;
  END IF;
END $$;
