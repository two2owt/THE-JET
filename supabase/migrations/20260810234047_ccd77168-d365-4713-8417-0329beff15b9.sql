-- 1. Column-list publication membership cannot be diffed between environments.
--    user_locations is also on the realtime deny list in docs/SECURITY_HARDENING.md.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'user_locations'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.user_locations';
  END IF;
END $$;

-- 2. claim_push_subscription() uses ON CONFLICT (user_id, endpoint) but no
--    matching unique index existed, so every device claim raised an error.
DELETE FROM public.push_subscriptions a
USING public.push_subscriptions b
WHERE a.ctid < b.ctid
  AND a.user_id IS NOT DISTINCT FROM b.user_id
  AND a.endpoint = b.endpoint;

CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_user_endpoint_key
  ON public.push_subscriptions (user_id, endpoint);